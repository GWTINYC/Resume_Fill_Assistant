export class AppError extends Error {
 constructor(code,message){super(message);this.name='AppError';this.code=code;}
}
const stages={validate:'检查文件类型和大小',read:'读取原文件',decode:'解析 TXT 编码',store:'保存素材到本地数据库',load:'读取已保存素材',pdf:'解析 PDF 文本',storeText:'保存 PDF 提取文本',profile:'更新资料预览'};
const known={
 TXT_EMPTY:['TXT_EMPTY','文件没有可用文字。请检查文件内容，再重新导入。'],
 TXT_ENCODING:['TXT_ENCODING','无法按 UTF-8、带 BOM 的 UTF-16 或 GB18030/GBK 解码。请在记事本或文本编辑器中另存为 UTF-8，再导入；不要只修改后缀。'],
 TXT_BINARY:['TXT_BINARY','文件含二进制控制字符，可能不是纯文本，或是没有编码标记的 UTF-16。请另存为 UTF-8 纯文本。'],
 TXT_FORMAT:['TXT_FORMAT','文件内容是 PDF、ZIP/Office 或 RTF 格式，不能通过改成 .txt 后缀导入。请导出为纯文本，或使用原 PDF。'],
 FILE_TYPE:['FILE_TYPE','只支持 PDF 和 TXT。请检查文件的实际扩展名，Windows 可在资源管理器中开启“文件扩展名”。'],
 FILE_SIZE:['FILE_SIZE','文件超过上限：TXT 2 MB，PDF 20 MB。请拆分素材或移除无关内容。'],
 PDF_FORMAT:['PDF_FORMAT','文件没有有效的 PDF 文件头。请使用原 PDF，不要只修改文件后缀。'],
 PDF_PAGES:['PDF_PAGES','PDF 超过 40 页，已保留原文件，未提取文本。请拆分后再导入。'],
 PDF_EMPTY:['PDF_EMPTY','PDF 没有可读取的文本层。请先 OCR，或从原文导出 TXT。'],
 PDF_PASSWORD:['PDF_PASSWORD','PDF 已加密或需要密码。请先使用无密码的副本，原文件仍保留。'],
 DB_BLOCKED:['STORE_BLOCKED','本地数据库被其它扩展页面占用。关闭其它资料页/侧栏，再重新打开；仍失败时重启浏览器。'],
 DB_TIMEOUT:['STORE_TIMEOUT','等待本地数据库响应超时。请重启浏览器后重试，并检查磁盘空间。']
};
export function importDiagnostic(error,{stage='validate',file={},persisted=false,textReady=false}={},environment={}){
 let [code,reason]=known[error?.code]||[];
 if(!code){
  const name=error?.name||'Error';
  if(name==='QuotaExceededError')[code,reason]=['STORE_QUOTA','浏览器本地存储或磁盘空间不足。请释放磁盘空间；如需删除旧素材，先导出要保留的资料。'];
  else if(['NotReadableError','NotFoundError'].includes(name)&&stage==='read')[code,reason]=['FILE_READ','浏览器无法读取文件。请先将 OneDrive/网盘文件完整下载到本机，再复制到普通本地目录重新选择；检查文件是否被移动或占用。'];
  else if(['NotAllowedError','SecurityError'].includes(name))[code,reason]=[stage==='read'?'FILE_ACCESS':'STORE_ACCESS','浏览器拒绝访问文件或本地存储。请使用普通浏览窗口，检查浏览器/单位策略以及文件访问权限。'];
  else if(name==='DataCloneError')[code,reason]=['STORE_CLONE','浏览器未能保存文件对象。请更新 Chrome/Edge 并重新选择本地文件；保留诊断信息以便排查。'];
  else if(stage==='decode')[code,reason]=known.TXT_ENCODING;
  else if(stage==='pdf')[code,reason]=['PDF_PARSE','PDF 文本解析失败，可能损坏或使用了暂不支持的格式。请尝试重新导出 PDF 或改用 TXT。'];
  else [code,reason]=[stage==='read'?'FILE_READ_UNKNOWN':['store','load','storeText'].includes(stage)?'STORE_FAILED':'IMPORT_FAILED','该环节未完成。请重新打开资料页后重试；若再次失败，请提供下方诊断信息。'];
 }
 const saved=persisted?(textReady?'原文件和文本已保存；后续步骤未完成。':'原文件已保存，文本提取尚未完成。'):'本次新素材尚未保存；未替换原有素材。';
 const title=stages[stage]||stage;
 // No filename, full path, file text, credential, raw exception message or stack.
 const report={code,stage,stageLabel:title,errorType:error?.name||'Error',fileType:/\.pdf$/i.test(file.name||'')?'pdf':/\.txt$/i.test(file.name||'')?'txt':'other',fileBytes:Number(file.size)||0,persisted,textReady,extensionVersion:environment.version||'unknown',browser:environment.browser||'unknown',platform:environment.platform||'unknown'};
 return {code,message:`[${code}] 失败环节：${title}\n${reason}\n${saved}`,report};
}
export function diagnosticEnvironment(){return {version:globalThis.chrome?.runtime?.getManifest?.().version,browser:globalThis.navigator?.userAgent,platform:globalThis.navigator?.userAgentData?.platform||globalThis.navigator?.platform};}
