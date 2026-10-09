// Declarative, versioned DOM contracts. A domain alone never enables an adapter.
// Custom company domains are supported when a complete component fingerprint matches.
export const PLATFORM_TEMPLATES=[
 {id:'moka',label:'Moka',revision:1,domains:['mokahr.com'],fingerprints:[['[class*="apply-block-"]','[class*="apply-fields-"]','[class*="apply-field-"]']],
  block:'[class*="apply-block-"]',heading:'[class*="blockTitle-"]',record:'[class*="apply-fields-"]',field:'[class*="apply-field-"]',fieldLabel:'[class*="title-"]',lookupLabels:['学校名称','专业名称'],catalogLabels:['性别','工作经验','最高学历','学历','证件类型','掌握程度','听说','读写'],selectLabels:{'证件号码':'证件类型'},
  sections:{'教育背景':'education','教育经历':'education','实习经历':'internship','实习经验':'internship','工作经历':'work','工作经验':'work','项目经验':'project','项目经历':'project','语言能力':'language','获奖经历':'awards'}},
 {id:'hotjob',label:'Hotjob',revision:1,domains:['hotjob.cn'],fingerprints:[['.form-cell','.form-cell-inner','.tit-wrap .tit']],
  block:'.form-cell',heading:'.tit-wrap .tit p,.tit-wrap .tit',record:'.form-cell-inner',field:'.form-item,.form-group',fieldLabel:'.form-item__text,.control-label,label',
  sections:{'教育经历':'education','教育背景':'education','实习经历':'internship','工作经历':'work','工作/实习经历':'work','项目经验':'project','项目经历':'project','在校实践':'practice','家庭关系':'family','外语能力':'language','获奖情况':'awards','论文/专著':'publications'}},
 {id:'beisen',label:'北森',revision:1,domains:['zhiye.com'],fingerprints:[['.form','.form-item','.phoenix-select'],['.form','.form-item','.phoenix-radio-group']],
  record:'.form',field:'.form-item',fieldLabel:'.form-item__text',
  sections:{'教育经历':'education','教育背景':'education','实习经历':'internship','工作经历':'work','项目经验':'project','项目经历':'project','课题项目经验':'project','外语能力':'language','获奖经历':'awards'}},
 // No guessed component contract: Feishu/Lark sites retain generic parsing until a
 // real form variant is inspected and a fixture proves its record/commit behaviour.
 {id:'lark',label:'飞书招聘',revision:0,domains:['recruitment.feishu.cn','jobs.feishu.cn','recruitment.larksuite.com'],fingerprints:[],sections:{}}
];
