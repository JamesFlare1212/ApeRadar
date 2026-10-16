export type SettingsSection = 'general' | 'appearance' | 'connection' | 'ratings' | 'text' | 'about'
export const SETTINGS_SECTIONS: Record<SettingsSection, { title: string; description: string }> = {
  general: { title: '常规', description: '按你的习惯，组织战局中的信息。' },
  appearance: { title: '外观', description: '选择主题与配色，让工作区更合心意。' },
  connection: { title: '游戏连接', description: '连接本地游戏，查看数据源的实时状态。' },
  ratings: { title: '评分与胜率', description: '调整舰长分类阈值与加权胜率参数。' },
  text: { title: '文本摘要', description: '用自己的方式，整理每场对局。' },
  about: { title: '关于与更新', description: '应用版本、软件更新与本地资料。' },
}
