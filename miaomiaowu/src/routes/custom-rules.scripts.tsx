import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Code } from 'lucide-react'

import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { OVERRIDE_SCRIPT_TEMPLATES } from '@/config/override-script-templates'

export const Route = createFileRoute('/custom-rules/scripts')({
  component: OverrideScriptsPage,
})

interface OverrideScript {
  id: number
  name: string
  hook: 'post_fetch' | 'pre_save_nodes'
  content: string
  enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

type ScriptFormData = {
  name: string
  hook: 'post_fetch' | 'pre_save_nodes'
  content: string
  enabled: boolean
  sort_order: number
}

const HOOK_LABELS: Record<string, string> = {
  post_fetch: '转换为客户端配置前',
  pre_save_nodes: '保存外部订阅节点前',
}

function OverrideScriptsPage() {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingScript, setEditingScript] = useState<OverrideScript | null>(null)
  const [deletingScriptId, setDeletingScriptId] = useState<number | null>(null)
  const [formData, setFormData] = useState<ScriptFormData>({
    name: '',
    hook: 'post_fetch',
    content: '',
    enabled: true,
    sort_order: 0,
  })

  const { data: userConfig } = useQuery<{ enable_override_scripts: boolean }>({
    queryKey: ['user-config'],
    queryFn: async () => {
      const response = await api.get('/api/user/config')
      return response.data
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: scripts = [], isLoading } = useQuery<OverrideScript[]>({
    queryKey: ['override-scripts'],
    queryFn: async () => {
      const response = await api.get('/api/admin/override-scripts')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: ScriptFormData) => {
      return api.post('/api/admin/override-scripts', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['override-scripts'] })
      setIsDialogOpen(false)
      toast.success('覆写脚本创建成功')
    },
    onError: () => toast.error('创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ScriptFormData }) => {
      return api.put(`/api/admin/override-scripts/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['override-scripts'] })
      setIsDialogOpen(false)
      toast.success('覆写脚本更新成功')
    },
    onError: () => toast.error('更新失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return api.delete(`/api/admin/override-scripts/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['override-scripts'] })
      setIsDeleteDialogOpen(false)
      toast.success('覆写脚本已删除')
    },
    onError: () => toast.error('删除失败'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, script, enabled }: { id: number; script: OverrideScript; enabled: boolean }) => {
      return api.put(`/api/admin/override-scripts/${id}`, {
        name: script.name,
        hook: script.hook,
        content: script.content,
        enabled,
        sort_order: script.sort_order,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['override-scripts'] })
    },
  })

  const handleCreate = () => {
    setEditingScript(null)
    setFormData({ name: '', hook: 'post_fetch', content: '', enabled: true, sort_order: 0 })
    setIsDialogOpen(true)
  }

  const handleEdit = (script: OverrideScript) => {
    setEditingScript(script)
    setFormData({
      name: script.name,
      hook: script.hook,
      content: script.content,
      enabled: script.enabled,
      sort_order: script.sort_order,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = () => {
    if (!formData.name || !formData.content) {
      toast.error('请填写名称和脚本内容')
      return
    }
    if (editingScript) {
      updateMutation.mutate({ id: editingScript.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleTemplateSelect = (templateName: string) => {
    const hookTemplates = OVERRIDE_SCRIPT_TEMPLATES[formData.hook] || []
    const template = hookTemplates.find(t => t.name === templateName)
    if (template) {
      setFormData(prev => ({ ...prev, content: template.content }))
    }
  }

  if (userConfig && !userConfig.enable_override_scripts) {
    return (
      <main className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 pt-24'>
        <div className='space-y-6'>
          <div className='text-center py-16'>
            <p className='text-muted-foreground'>覆写脚本功能未启用，请在系统设置中开启。</p>
            <div className='mt-4 flex justify-center gap-2'>
              <Link to='/custom-rules'>
                <Button variant='outline'>返回覆写规则</Button>
              </Link>
              <Link to='/system-settings'>
                <Button>前往系统设置</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className='mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 pt-24'>
      <div className='space-y-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold'>覆写脚本</h1>
            <p className='text-muted-foreground mt-2'>
              使用 JavaScript 脚本修改订阅配置或节点属性
            </p>
          </div>
          <div className='flex gap-2'>
            <Link to='/custom-rules'>
              <Button variant='outline'>覆写规则</Button>
            </Link>
            <Button onClick={handleCreate}>
              <Plus className='mr-2 h-4 w-4' />
              新建覆写脚本
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>脚本列表</CardTitle>
            <CardDescription>{scripts.length} 个脚本</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='text-center py-8 text-muted-foreground'>加载中...</div>
            ) : (
              <DataTable
                data={scripts}
                getRowKey={(s) => s.id}
                emptyText='暂无覆写脚本'
                columns={[
                  {
                    header: '名称',
                    cell: (s) => (
                      <div className='flex items-center gap-2'>
                        <Code className='h-4 w-4 text-muted-foreground' />
                        <span className='font-medium'>{s.name}</span>
                      </div>
                    ),
                  },
                  {
                    header: '钩子',
                    cell: (s) => (
                      <Badge variant='outline'>
                        {HOOK_LABELS[s.hook] || s.hook}
                      </Badge>
                    ),
                  },
                  {
                    header: '状态',
                    cell: (s) => (
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: s.id, script: s, enabled: checked })
                        }
                      />
                    ),
                  },
                  {
                    header: '操作',
                    cell: (s) => (
                      <div className='flex gap-2'>
                        <Button variant='ghost' size='icon' onClick={() => handleEdit(s)}>
                          <Pencil className='h-4 w-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={() => {
                            setDeletingScriptId(s.id)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>{editingScript ? '编辑覆写脚本' : '新建覆写脚本'}</DialogTitle>
            <DialogDescription>
              脚本需要定义 main 函数，接收配置对象并返回修改后的结果
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>名称</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder='输入脚本名称'
              />
            </div>

            <div className='space-y-2'>
              <Label>钩子</Label>
              <Select
                value={formData.hook}
                onValueChange={(v) => setFormData(prev => ({ ...prev, hook: v as ScriptFormData['hook'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='post_fetch'>转换为客户端配置前</SelectItem>
                  <SelectItem value='pre_save_nodes'>保存外部订阅节点前</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>模板</Label>
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder='选择模板填充脚本内容' />
                </SelectTrigger>
                <SelectContent>
                  {(OVERRIDE_SCRIPT_TEMPLATES[formData.hook] || []).map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>脚本内容</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder={`function main(${formData.hook === 'post_fetch' ? 'config' : 'proxies'}) {\n  // ...\n  return ${formData.hook === 'post_fetch' ? 'config' : 'proxies'};\n}`}
                className='font-mono text-sm min-h-[300px]'
              />
            </div>

            <div className='flex items-center gap-2'>
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
              />
              <Label>启用</Label>
            </div>

            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setIsDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>
                {editingScript ? '保存' : '创建'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，确定要删除这个覆写脚本吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingScriptId && deleteMutation.mutate(deletingScriptId)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
