import { Crosshair, Info, Plug, Star } from 'lucide-react'
import { Icon } from '@/components/Icon.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion.js'
import { Button, Notice } from '@/components/ui.js'

const steps = [
  { icon: Plug, title: '01 / 连接游戏', text: '在设置中选择正确区服和游戏目录，应用会自动监测并载入新对局，仅在异常时提示。' },
  { icon: Crosshair, title: '02 / 查看与切换', text: '新阵容会自动查询。切换账号或加权胜率，点击舰长查看模式细分。请求失败时可只重试失败数据，阵容顺序不会因战绩更新而变化。' },
  { icon: Star, title: '03 / 留下记录', text: '星标舰长并选择本地关注类型，备注可独立保存；移除关注前会提示确认。历史快照可随时回看，文字摘要由你主动复制。' },
] as const

export function HelpPage({ onSettings }: { onSettings: () => void }) {
  return <div className="help-layout">
    <Card className="help-intro">
      <CardHeader><span className="help-radar"><Icon icon={Crosshair} /></span><CardTitle><h2>让每一场对局，更有准备</h2></CardTitle><CardDescription>ApeRadar Next 读取游戏生成的阵容文件，查询公开累计战绩，并将信息整理在同一个工作区。</CardDescription></CardHeader>
      <CardContent className="flex justify-center"><Button variant="default" onClick={onSettings}>连接游戏</Button></CardContent>
    </Card>
    <div className="help-steps">{steps.map(step => <Card className="help-step" key={step.title}>
      <CardHeader><Icon icon={step.icon} /><CardTitle><h3>{step.title}</h3></CardTitle></CardHeader><CardContent><p>{step.text}</p></CardContent>
    </Card>)}</div>
    <Card className="help-faq">
      <CardHeader><CardTitle><h2>理解这些数字</h2></CardTitle></CardHeader>
      <CardContent>
        <Accordion type="single" collapsible defaultValue="faq-1">
          <AccordionItem value="faq-1"><AccordionTrigger>账号胜率和加权胜率有什么区别？</AccordionTrigger><AccordionContent><p>账号胜率直接使用累计 PvP 胜场除以场次。加权胜率默认先按单排/双排/三排的场次乘以 5/2/1，再混合最多 20% 的本舰胜率；本舰 60 场时达到上限。所有参数可在设置调整。</p></AccordionContent></AccordionItem>
          <AccordionItem value="faq-2"><AccordionTrigger>队伍平均胜率是胜负预测吗？</AccordionTrigger><AccordionContent><p>不是。它是有公开战绩的舰长胜率的等权算术平均，不包含隐藏或尚未取得的数据，也不表示本场的获胜概率。</p></AccordionContent></AccordionItem>
          <AccordionItem value="faq-3"><AccordionTrigger>为什么有的舰长没有数据？</AccordionTrigger><AccordionContent><p>资料可能确实隐藏，也可能是区服不匹配、昵称未命中、网络或服务错误。应用分别显示这些状态。可检查区服、切换来源或重试。</p></AccordionContent></AccordionItem>
          <AccordionItem value="faq-4"><AccordionTrigger>为什么船名显示未知？</AccordionTrigger><AccordionContent><p>本地船表可能暂未收录新舰船。账号查询与本地船名显示分开处理，未知名称不会影响其他玩家的战绩。</p></AccordionContent></AccordionItem>
          <AccordionItem value="faq-5"><AccordionTrigger>数据存在哪里，更新如何安装？</AccordionTrigger><AccordionContent><p>设置、对局、关注名单和缓存使用本机数据库，设置页列出存储位置。应用没有默认阵容上传或模拟聊天发送。桌面版会自动检查更新；安装版下载完成后，由你点击“重启并安装”才开始安装。便携版需要从正式发布页手动下载和替换。</p></AccordionContent></AccordionItem>
        </Accordion>
        <Notice className="mt-4" icon={<Icon icon={Info} />}>初次显示的「示例对局」使用合成昵称与战绩，不会发送真实查询。</Notice>
      </CardContent>
    </Card>
  </div>
}
