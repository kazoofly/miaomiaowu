package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"miaomiaowu/internal/logger"
	"miaomiaowu/internal/notify"
)

var globalBruteForceProtector *BruteForceProtector

type bruteForceRecord struct {
	count      int
	firstTime  time.Time
	blockUntil time.Time
}

type BruteForceProtector struct {
	attempts      sync.Map // IP -> *bruteForceRecord
	maxFailures   int
	window        time.Duration
	blockDuration time.Duration
	whitelist     map[string]struct{}
}

func NewBruteForceProtector(maxFailures int, whitelistRaw string) *BruteForceProtector {
	if maxFailures <= 0 {
		maxFailures = 5
	}
	whitelist := make(map[string]struct{})
	for _, part := range strings.FieldsFunc(whitelistRaw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ' '
	}) {
		ip := strings.TrimSpace(part)
		if ip == "" {
			continue
		}
		whitelist[ip] = struct{}{}
	}
	p := &BruteForceProtector{
		maxFailures:   maxFailures,
		window:        24 * time.Hour,
		blockDuration: 24 * time.Hour,
		whitelist:     whitelist,
	}
	globalBruteForceProtector = p
	return p
}

func GetBruteForceProtector() *BruteForceProtector {
	return globalBruteForceProtector
}

func (p *BruteForceProtector) IsBlocked(ip, path string) bool {
	if _, ok := p.whitelist[ip]; ok {
		return false
	}
	val, ok := p.attempts.Load(ip)
	if !ok {
		return false
	}
	rec := val.(*bruteForceRecord)

	now := time.Now()
	if !rec.blockUntil.IsZero() && now.Before(rec.blockUntil) {
		logger.Warn("🚫🚫🚫 [BRUTE_FORCE] 已封禁IP尝试访问，已拦截",
			"ip", ip,
			"访问路径", path,
			"封禁剩余", rec.blockUntil.Sub(now).Round(time.Second).String(),
		)
		return true
	}

	// 封禁已过期，清除
	if !rec.blockUntil.IsZero() {
		logger.Info("✅ [BRUTE_FORCE] IP封禁已过期，已自动解除",
			"ip", ip,
		)
		p.attempts.Delete(ip)
	}
	return false
}

func (p *BruteForceProtector) RecordFailure(ip, path string) {
	if _, ok := p.whitelist[ip]; ok {
		return
	}
	now := time.Now()

	val, loaded := p.attempts.Load(ip)
	if !loaded {
		logger.Warn("⚠️ [BRUTE_FORCE] 订阅探测失败",
			"ip", ip,
			"访问路径", path,
			"次数", fmt.Sprintf("1/%d", p.maxFailures),
		)
		p.attempts.Store(ip, &bruteForceRecord{
			count:     1,
			firstTime: now,
		})
		return
	}

	rec := val.(*bruteForceRecord)

	// 已被封禁，忽略
	if !rec.blockUntil.IsZero() && now.Before(rec.blockUntil) {
		return
	}

	// 窗口过期，重置
	if now.Sub(rec.firstTime) > p.window {
		logger.Warn("⚠️ [BRUTE_FORCE] 订阅探测失败（窗口重置）",
			"ip", ip,
			"访问路径", path,
			"次数", fmt.Sprintf("1/%d", p.maxFailures),
		)
		p.attempts.Store(ip, &bruteForceRecord{
			count:     1,
			firstTime: now,
		})
		return
	}

	rec.count++
	if rec.count >= p.maxFailures {
		rec.blockUntil = now.Add(p.blockDuration)
		logger.Warn("🚫🚫🚫 [BRUTE_FORCE] IP 已被封禁！",
			"ip", ip,
			"触发路径", path,
			"失败次数", rec.count,
			"封禁至", rec.blockUntil.Format("2006-01-02 15:04:05"),
		)

		if n := GetNotifier(); n != nil {
			go n.Send(context.Background(), notify.Event{
				Type:    notify.EventIPBan,
				Title:   "IP 封禁",
				Message: fmt.Sprintf("IP `%s` 已被封禁\n触发路径: `%s`\n失败次数: %d\n封禁至: %s", ip, path, rec.count, rec.blockUntil.Format("2006-01-02 15:04:05")),
			})
		}
	} else {
		logger.Warn("⚠️ [BRUTE_FORCE] 订阅探测失败",
			"ip", ip,
			"访问路径", path,
			"次数", fmt.Sprintf("%d/%d", rec.count, p.maxFailures),
		)
	}
}

func (p *BruteForceProtector) RecordSuccess(ip string) {
	p.attempts.Delete(ip)
}

func (p *BruteForceProtector) UpdateConfig(maxFailures int, whitelistRaw string) {
	if maxFailures <= 0 {
		maxFailures = 5
	}
	whitelist := make(map[string]struct{})
	for _, part := range strings.FieldsFunc(whitelistRaw, func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == '\t' || r == ' '
	}) {
		ip := strings.TrimSpace(part)
		if ip == "" {
			continue
		}
		whitelist[ip] = struct{}{}
	}
	p.maxFailures = maxFailures
	p.whitelist = whitelist
}

// StatusRecorder wraps http.ResponseWriter to capture the status code.
type StatusRecorder struct {
	http.ResponseWriter
	StatusCode int
}

func (r *StatusRecorder) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}
