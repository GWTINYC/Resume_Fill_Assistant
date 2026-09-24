import {AppError} from './diagnostics.js';
export const NATIVE_HOST='com.resumefill.assistant';
const hints={
 PC_NOT_INSTALLED:'没有找到本地连接程序。请下载并运行对应系统的安装脚本，填入下方扩展 ID。',
 PC_ORIGIN_DENIED:'本地程序尚未授权当前扩展 ID。请重新运行安装脚本，加入下方 ID；已有密钥文件会保留。',
 PC_HOST_FAILED:'本地程序启动或通信失败。请重新运行安装脚本；Mac 检查 Python 3，Windows 检查 .NET Framework 4.8。',
 PC_FILE_INVALID:'PC 密钥文件格式异常，已停止覆盖。请先备份 ~/.resume-fill-assistant/api-keys.json，再核对其中的 version 和 keys。',
 PC_FILE_ACCESS:'无法访问 PC 密钥文件。请检查当前系统账户对 ~/.resume-fill-assistant 的访问权限。',
 PC_FILE_BUSY:'另一个窗口正在写入 PC 密钥文件，请稍后重试。',
 PC_KEY_INVALID:'密钥格式不正确，请检查对应服务的完整 API key。',
 PC_IO_FAILED:'PC 文件读写失败，请检查磁盘空间和用户目录权限。',
 PC_REQUEST_INVALID:'本地程序与扩展请求不兼容，请更新本地连接程序。',
 PC_PROTOCOL_INVALID:'本地程序返回的消息无法识别，请重新安装同版本的本地连接程序。'
};
export const pcKeyHint=code=>`[${code}] ${hints[code]||hints.PC_HOST_FAILED}`;
export const validApiKey=(value,provider)=>typeof value==='string'&&value.length<=4096&&!/\s/.test(value)&&(provider==='jev'?value.startsWith('apikey_'):provider==='deepseek'&&value.startsWith('sk-'));
export async function nativeKeyRequest(request){
 try{
  const result=await chrome.runtime.sendNativeMessage(NATIVE_HOST,request);
  if(!result?.ok)throw new AppError(result?.code&&hints[result.code]?result.code:'PC_HOST_FAILED','');
  if(request.action==='get'&&result.value!==''&&!validApiKey(result.value,request.provider))throw new AppError('PC_PROTOCOL_INVALID','');
  if(request.action==='status'&&(!result.present||typeof result.present.jev!=='boolean'||typeof result.present.deepseek!=='boolean'))throw new AppError('PC_PROTOCOL_INVALID','');
  return result;
 }catch(error){
  const code=error.code||(/not found|not registered|no such native/i.test(error.message)?'PC_NOT_INSTALLED':/forbidden|access.*not allowed|not.*allowed|permission/i.test(error.message)?'PC_ORIGIN_DENIED':'PC_HOST_FAILED');
  throw new AppError(code,pcKeyHint(code));
 }
}
