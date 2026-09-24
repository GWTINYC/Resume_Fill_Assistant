import {AppError} from './diagnostics.js';
export function decodeText(bytes){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 if(!bytes.length)throw new AppError('TXT_EMPTY','TXT 文件内容为空。');
 const header=new TextDecoder('ascii').decode(bytes.subarray(0,12));
 if(header.startsWith('%PDF-')||header.startsWith('PK\x03\x04')||header.startsWith('{\\rtf'))throw new AppError('TXT_FORMAT','文件不是纯文本。');
 let encoding='utf-8',text;
 try{
  if(bytes[0]===0xff&&bytes[1]===0xfe){encoding='utf-16le';text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
  else if(bytes[0]===0xfe&&bytes[1]===0xff){encoding='utf-16be';text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
  else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{encoding='gb18030';text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}}
 }catch{throw new AppError('TXT_ENCODING','TXT 编码无法解析，请另存为 UTF-8 纯文本。');}
 if(text.includes('\0')||/[\x01-\x08\x0e-\x1f]/.test(text))throw new AppError('TXT_BINARY','TXT 含二进制控制字符，请转换为 UTF-8 纯文本。');
 text=text.replace(/^\uFEFF/,'');if(!text.trim())throw new AppError('TXT_EMPTY','TXT 文件内容为空。');return {text,encoding};
}
