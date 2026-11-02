import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

/** Only the independently licensed, pinned original upstream font is accepted. */
const SOURCE_SHA256=new Set(['69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68','5a6ceb287ed2fc6cfc6213144ebea68cbd94b20fc9eb873d8486493bf02d9bda']);
/** Explicit source, derived asset and provenance report paths belong to this build invocation. */
const SOURCE=process.argv[2],OUTPUT=process.argv[3],REPORT=process.argv[4];
if(!SOURCE||!OUTPUT||!REPORT)throw new Error('Usage: node scripts/build-korean-font.ts <original.otf> <derived.otf> <report.json>');
if(path.resolve(SOURCE)===path.resolve(OUTPUT))throw new Error('The original upstream font cannot be overwritten.');
if(path.resolve(REPORT)===path.resolve(SOURCE)||path.resolve(REPORT)===path.resolve(OUTPUT))throw new Error('The provenance report must use a separate path from both font files.');
/** Modern Hangul syllables use the observed original Malgun one-em advance. */
const FIRST_SYLLABLE=0xac00,LAST_SYLLABLE=0xd7a3;
/** The OpenType offset-table checksum target is independent of any rendering measurement. */
const CHECKSUM_TARGET=0xb1b0afba;
/** A bounded original SFNT table retains both its directory record and payload range. */
interface FontTable {record:number;offset:number;length:number;}
/** CFF index metadata ranges stay the same size so all glyph-program offsets remain unchanged. */
interface IndexRange {from:number;to:number;}
/** Original CFF index objects precede the next index at an exact byte boundary. */
interface CffIndex {end:number;objects:IndexRange[];}
/** An original CFF DICT operand retains its value and exact encoded byte range. */
interface DictOperand {value:number;from:number;to:number;}

/**
 * Read original CID font-dictionary ownership for every admitted glyph.
 *
 * The pinned CFF font can use either a direct byte map or ordered format-three
 * ranges. Original ranges must cover every glyph without gaps or overlaps.
 * @param {Buffer} bytes - Complete original admitted static font.
 * @param {number} offset - Absolute original FDSelect position.
 * @param {number} glyphCount - Original maxp glyph count.
 * @returns {Uint8Array} Exact original font-dictionary index for each glyph.
 * @throws {RangeError} If original FDSelect ranges are incomplete or unsupported.
 * @example
 * const owners=readFontDictionaryOwners(bytes,fdSelectOffset,glyphCount);
 */
function readFontDictionaryOwners(bytes:Buffer,offset:number,glyphCount:number):Uint8Array{
  /** All glyph ownership is copied before considering script-specific metric changes. */
  const mapping=new Uint8Array(glyphCount),format=bytes[offset];
  if(format===0){mapping.set(bytes.subarray(offset+1,offset+1+glyphCount));return mapping;}
  if(format!==3)throw new RangeError('The original CFF FDSelect format is unsupported.');
  /** Range boundaries are original glyph IDs followed by one original font-dictionary index. */
  const count=bytes.readUInt16BE(offset+1);
  if(!count||bytes.readUInt16BE(offset+3)!==0||bytes.readUInt16BE(offset+3+count*3)!==glyphCount)throw new RangeError('Original CFF glyph ownership does not cover the complete font.');
  for(let index=0;index<count;index++){
    /** Each original contiguous ownership range retains its exact glyph boundaries. */
    const row=offset+3+index*3,first=bytes.readUInt16BE(row),last=bytes.readUInt16BE(row+3),owner=bytes[row+2];
    if(last<=first||last>glyphCount)throw new RangeError('Original CFF glyph ownership ranges are invalid.');
    mapping.fill(owner,first,last);
  }
  return mapping;
}

/**
 * Decode original CFF DICT metadata without interpreting a glyph program.
 *
 * Integer and real operands retain their original byte ranges. Font and private
 * dictionary operators delimit operand stacks; charstrings are never executed.
 * @param {Buffer} bytes - Complete original admitted static font.
 * @param {number} from - First original dictionary byte.
 * @param {number} to - Exclusive original dictionary boundary.
 * @returns {Map<string,DictOperand[]>} Original operator operands and encoded ranges.
 * @throws {RangeError} If the original metadata contains an unsupported or truncated encoding.
 * @example
 * const privateDict=readCffDict(bytes,privateOffset,privateOffset+privateLength);
 */
function readCffDict(bytes:Buffer,from:number,to:number):Map<string,DictOperand[]>{
  /** Every original operator owns only its immediately preceding operand stack. */
  const result=new Map<string,DictOperand[]>();
  let cursor=from,operands:DictOperand[]=[];
  while(cursor<to){
    /** Operand ranges identify in-place numeric changes without shifting any following glyph data. */
    const start=cursor,byte=bytes[cursor++];
    let value:number|undefined;
    if(byte>=32&&byte<=246)value=byte-139;
    else if(byte>=247&&byte<=250)value=(byte-247)*256+bytes[cursor++]+108;
    else if(byte>=251&&byte<=254)value=-(byte-251)*256-bytes[cursor++]-108;
    else if(byte===28){value=bytes.readInt16BE(cursor);cursor+=2;}
    else if(byte===29){value=bytes.readInt32BE(cursor);cursor+=4;}
    else if(byte===30){
      let text='',complete=false;
      while(cursor<to&&!complete){
        /** Original real-number nibbles use the CFF DICT decimal/exponent encoding. */
        const encoded=bytes[cursor++];
        for(/** Both nibbles belong to the same original real-number operand. */const nibble of [encoded>>>4,encoded&15]){
          if(nibble===15){complete=true;break;}
          if(nibble<10)text+=String(nibble);
          else if(nibble===10)text+='.';
          else if(nibble===11)text+='E';
          else if(nibble===12)text+='E-';
          else if(nibble===14)text+='-';
          else throw new RangeError('The original CFF DICT real encoding is invalid.');
        }
      }
      value=Number(text);if(!complete||!Number.isFinite(value))throw new RangeError('The original CFF DICT real operand is incomplete.');
    }else if(byte<=21){
      /** Escaped dictionary operators remain distinct from ordinary one-byte operators. */
      const operator=byte===12?'12.'+bytes[cursor++]:String(byte);
      result.set(operator,operands);operands=[];
    }else throw new RangeError('The original CFF DICT operand encoding is unsupported.');
    if(cursor>to)throw new RangeError('The original CFF DICT operand exceeds its dictionary.');
    if(value!==undefined)operands.push({value,from:start,to:cursor});
  }
  return result;
}

/**
 * Calculate a padded big-endian OpenType checksum over an exact byte range.
 *
 * Missing final padding bytes contribute zero. Per-word unsigned folding avoids
 * precision loss when the original multi-megabyte font is inspected.
 * @param {Buffer} bytes - Complete original or derived SFNT bytes.
 * @param {number} offset - First byte in the selected original range.
 * @param {number} length - Number of nonpadding bytes to include.
 * @returns {number} Unsigned thirty-two-bit SFNT checksum.
 * @example
 * const checksum=fontChecksum(bytes,table.offset,table.length);
 */
function fontChecksum(bytes:Buffer,offset:number,length:number):number{
  let sum=0;
  for(let index=0;index<length;index+=4){
    let word=0;
    for(let part=0;part<4;part++)word=(word*256+(index+part<length?bytes[offset+index+part]:0))>>>0;
    sum=(sum+word)>>>0;
  }
  return sum;
}

/**
 * Read original CFF1 index ranges without decoding a glyph program.
 *
 * One-based variable-width offsets are resolved within the original CFF table.
 * Names can later change in place while every following charstring stays intact.
 * @param {Buffer} bytes - Complete original static font bytes.
 * @param {FontTable} cff - Original CFF table range.
 * @param {number} start - Absolute original index position.
 * @returns {CffIndex} Bounded original object ranges and following index position.
 * @throws {RangeError} If an index exceeds its admitted original CFF range.
 * @example
 * const names=readCffIndex(bytes,cff,cff.offset+bytes[cff.offset+2]);
 */
function readCffIndex(bytes:Buffer,cff:FontTable,start:number):CffIndex{
  /** Original index counts and offsets remain separate from selected metadata content. */
  const count=bytes.readUInt16BE(start),objects:IndexRange[]=[];
  if(!count)return{end:start+2,objects};
  /** Original variable-width offsets are never rewritten or shifted. */
  const size=bytes[start+2],data=start+3+(count+1)*size;
  if(size<1||size>4)throw new RangeError('The original CFF index offset width is invalid.');
  for(let index=0;index<count;index++){
    /** Every original string object remains inside its own admitted table. */
    const from=data+bytes.readUIntBE(start+3+index*size,size)-1,to=data+bytes.readUIntBE(start+3+(index+1)*size,size)-1;
    if(from<data||to<from||to>cff.offset+cff.length)throw new RangeError('An original CFF index object exceeds its table.');
    objects.push({from,to});
  }
  return{end:data+bytes.readUIntBE(start+3+count*size,size)-1,objects};
}

/**
 * Resolve a Unicode codepoint from the original complete format-twelve cmap.
 *
 * Binary search retains original glyph identities instead of assigning new
 * glyphs, remapping Unicode or rewriting any source text.
 * @param {Buffer} bytes - Complete original pinned font.
 * @param {number} cmap - Absolute original format-twelve subtable offset.
 * @param {number} codepoint - Original Unicode scalar to resolve.
 * @returns {number} Original glyph ID or zero for an unmapped scalar.
 * @example
 * const glyph=originalGlyph(bytes,cmap,0xac00);
 */
function originalGlyph(bytes:Buffer,cmap:number,codepoint:number):number{
  let low=0,high=bytes.readUInt32BE(cmap+12)-1;
  while(low<=high){
    /** Original groups map one contiguous Unicode interval to one contiguous glyph interval. */
    const middle=(low+high)>>>1,row=cmap+16+middle*12,first=bytes.readUInt32BE(row),last=bytes.readUInt32BE(row+4);
    if(codepoint<first)high=middle-1;
    else if(codepoint>last)low=middle+1;
    else return bytes.readUInt32BE(row+8)+codepoint-first;
  }
  return 0;
}

/**
 * Rename a same-length family prefix only inside an admitted metadata field.
 *
 * Equal byte lengths preserve every CFF offset. Copyright, licensing, trademark
 * notices and glyph programs are excluded by the caller's selected field ranges.
 * @param {Buffer} bytes - Private derived copy of the original font.
 * @param {number} from - First byte of an admitted name field.
 * @param {number} to - Exclusive original field boundary.
 * @param {Buffer} original - Original ASCII or UTF-16BE family prefix.
 * @param {Buffer} replacement - Equal-length distinct derived prefix.
 * @returns {number} Number of original family prefixes replaced in the field.
 * @throws {RangeError} If replacing the prefix would shift original font offsets.
 * @example
 * replaceFamilyPrefix(bytes,field.from,field.to,Buffer.from('Noto'),Buffer.from('Fhan'));
 */
function replaceFamilyPrefix(bytes:Buffer,from:number,to:number,original:Buffer,replacement:Buffer):number{
  if(original.length!==replacement.length)throw new RangeError('Font metadata replacement must preserve original byte lengths.');
  let count=0,position=from;
  while(position<to){
    /** Searches remain bounded by the selected metadata field. */
    const next=bytes.indexOf(original,position);
    if(next<0||next+original.length>to)break;
    replacement.copy(bytes,next);count++;position=next+original.length;
  }
  return count;
}

/** Original bytes are copied before any derived metric or metadata changes. */
const original=await readFile(SOURCE),sourceSha256=createHash('sha256').update(original).digest('hex'),bytes=Buffer.from(original),tables=new Map<string,FontTable>();
if(!SOURCE_SHA256.has(sourceSha256)||bytes.toString('ascii',0,4)!=='OTTO')throw new Error('Only the pinned original openly licensed CFF font is admitted.');
for(let index=0;index<bytes.readUInt16BE(4);index++){
  /** Original table ranges and checksum slots remain fixed throughout the experiment. */
  const record=12+index*16,tag=bytes.toString('ascii',record,record+4),offset=bytes.readUInt32BE(record+8),length=bytes.readUInt32BE(record+12);
  if(offset+length>bytes.length)throw new RangeError('An original SFNT table exceeds the original file.');
  tables.set(tag,{record,offset,length});
}
/** Required original tables retain their original structure and exact glyph count. */
const head=tables.get('head')!,hhea=tables.get('hhea')!,hmtx=tables.get('hmtx')!,maxp=tables.get('maxp')!,cmapTable=tables.get('cmap')!,name=tables.get('name')!,cff=tables.get('CFF ')!,units=bytes.readUInt16BE(head.offset+18),glyphCount=bytes.readUInt16BE(maxp.offset+4),metricCount=bytes.readUInt16BE(hhea.offset+34);
if(units!==1000||metricCount!==glyphCount)throw new Error('The pinned original font metric layout changed.');
let cmap:number|undefined;
for(let index=0;index<bytes.readUInt16BE(cmapTable.offset+2);index++){
  /** Exact original Unicode format-twelve mapping is shared by Windows and Unicode platform records. */
  const record=cmapTable.offset+4+index*8,platform=bytes.readUInt16BE(record),offset=cmapTable.offset+bytes.readUInt32BE(record+4);
  if((platform===0||platform===3)&&bytes.readUInt16BE(offset)===12)cmap=offset;
}
if(cmap===undefined)throw new Error('The original complete Unicode cmap was not found.');
/** Only original modern Hangul glyph IDs receive the independently observed one-em target advance. */
const changedGlyphs=new Set<number>();
for(let codepoint=FIRST_SYLLABLE;codepoint<=LAST_SYLLABLE;codepoint++){
  /** Original Unicode identity and side bearing are kept independently from its horizontal advance. */
  const glyph=originalGlyph(original,cmap,codepoint),offset=hmtx.offset+4*glyph;
  if(glyph===0||glyph>=metricCount||original.readUInt16BE(offset)!==920)throw new Error('An original modern Hangul glyph does not have the measured pinned advance.');
  bytes.writeUInt16BE(units,offset);changedGlyphs.add(glyph);
}
if(changedGlyphs.size!==11172)throw new Error('The original modern Hangul glyph mapping was not complete and unique.');
/** Distinct ASCII and UTF-16BE family prefixes avoid retaining the original primary font name. */
const asciiOriginal=Buffer.from('Noto','ascii'),asciiDerived=Buffer.from('Fhan','ascii'),unicodeOriginal=Buffer.from('Noto','utf16le').swap16(),unicodeDerived=Buffer.from('Fhan','utf16le').swap16(),renamedIds=new Set([1,3,4,6,16,18,21,25]);
let renamedNames=0,renamedCffNames=0;
for(let index=0;index<bytes.readUInt16BE(name.offset+2);index++){
  /** Only identity-bearing name IDs are admitted; all original legal and authorship fields remain intact. */
  const record=name.offset+6+index*12,platform=bytes.readUInt16BE(record),id=bytes.readUInt16BE(record+6),length=bytes.readUInt16BE(record+8),from=name.offset+bytes.readUInt16BE(name.offset+4)+bytes.readUInt16BE(record+10),unicode=platform===0||platform===3;
  if(renamedIds.has(id))renamedNames+=replaceFamilyPrefix(bytes,from,from+length,unicode?unicodeOriginal:asciiOriginal,unicode?unicodeDerived:asciiDerived);
}
/** CFF metadata precedes every following program byte at the same original absolute offsets. */
const names=readCffIndex(original,cff,cff.offset+original[cff.offset+2]),top=readCffIndex(original,cff,names.end),strings=readCffIndex(original,cff,top.end);
/** Original CID font dictionaries identify script-specific default widths independently of hmtx. */
const topDict=readCffDict(original,top.objects[0].from,top.objects[0].to),fdArray=readCffIndex(original,cff,cff.offset+topDict.get('12.36')![0].value),fontDictionaries=[];
for(let index=0;index<fdArray.objects.length;index++){
  /** Each original CID subfont retains its own private metrics and actual declared name. */
  const range=fdArray.objects[index],dict=readCffDict(original,range.from,range.to),nameId=dict.get('12.38')![0].value,string=strings.objects[nameId-391],fontName=original.toString('ascii',string.from,string.to),privateOperands=dict.get('18')!,privateFrom=cff.offset+privateOperands[1].value,privateTo=privateFrom+privateOperands[0].value,privateDict=readCffDict(original,privateFrom,privateTo);
  fontDictionaries.push({index,fontName,fontMatrix:dict.get('12.7'),defaultWidth:privateDict.get('20'),nominalWidth:privateDict.get('21')});
}
/** Original Hangul CID ownership includes encoded syllables and their original shaping alternates. */
const hangul=fontDictionaries.find(
 /**
  * Select the original explicitly named Hangul subfont.
  *
  * Other script dictionaries retain their original metrics and outline data.
  * @param {object} dictionary - Original CID font-dictionary metadata.
  * @returns {boolean} Whether this is the original Hangul-only subfont.
  * @example
  * isHangulDictionary({fontName:'NotoSansKR-Regular-Hangul'}); // true
  */
 function isHangulDictionary(dictionary){return /^NotoSansKR-(?:Regular|Bold)-Hangul$/u.test(dictionary.fontName);}
),ownership=readFontDictionaryOwners(original,cff.offset+topDict.get('12.37')![0].value,glyphCount),defaultWidth=hangul?.defaultWidth?.[0];
if(!hangul||!defaultWidth||defaultWidth.value!==920)throw new Error('The original independently observed Hangul default width was not found.');
/** The original and derived positive DICT width values occupy exactly the same two bytes. */
const encodedWidth=Buffer.from([247+Math.floor((units-108)/256),(units-108)%256]);
if(encodedWidth.length!==defaultWidth.to-defaultWidth.from)throw new Error('The original CFF width operand cannot be changed without shifting glyph programs.');
encodedWidth.copy(bytes,defaultWidth.from);
for(let glyph=0;glyph<glyphCount;glyph++){
  /** Encoded and substituted Hangul glyphs keep one coherent default advance across native engines. */
  const offset=hmtx.offset+4*glyph;
  if(ownership[glyph]===hangul.index&&original.readUInt16BE(offset)===920){bytes.writeUInt16BE(units,offset);changedGlyphs.add(glyph);}
  else if(ownership[glyph]!==hangul.index&&bytes.readUInt32BE(offset)!==original.readUInt32BE(offset))throw new Error('An unrelated script metric changed.');
}
for(let codepoint=FIRST_SYLLABLE;codepoint<=LAST_SYLLABLE;codepoint++)if(ownership[originalGlyph(original,cmap,codepoint)]!==hangul.index)throw new Error('An original modern Hangul syllable belongs to an unexpected script dictionary.');
for(/** The original PostScript identity is renamed without changing the Name INDEX structure. */const range of names.objects)renamedCffNames+=replaceFamilyPrefix(bytes,range.from,range.to,asciiOriginal,asciiDerived);
for(/** Font-family and CID subfont names are distinct from original copyright or trademark notices. */const range of strings.objects){
  /** Original metadata is classified before any derived replacement. */
  const text=original.toString('ascii',range.from,range.to);
  if(/^Noto(?:SansKR| Sans KR)(?:[- ]|$)/u.test(text))renamedCffNames+=replaceFamilyPrefix(bytes,range.from,range.to,asciiOriginal,asciiDerived);
}
for(let index=0;index<original.readUInt16BE(name.offset+2);index++){
  /** Original legal, authorship, trademark, version and unrelated name fields remain byte-identical. */
  const record=name.offset+6+index*12,id=original.readUInt16BE(record+6),length=original.readUInt16BE(record+8),from=name.offset+original.readUInt16BE(name.offset+4)+original.readUInt16BE(record+10);
  if(!renamedIds.has(id)&&!bytes.subarray(from,from+length).equals(original.subarray(from,from+length)))throw new Error('An original nonidentity font name field changed.');
}
if(renamedNames<3||renamedCffNames<3)throw new Error('Distinct derived font identities were not completely established.');
/** All CFF program data remains identical apart from the explicitly admitted private default-width operand. */
const protectedCff=Buffer.from(bytes.subarray(strings.end,cff.offset+cff.length));
original.copy(protectedCff,defaultWidth.from-strings.end,defaultWidth.from,defaultWidth.to);
/** Normalization excludes only the decoded non-outline width metadata before comparing every program byte. */
const originalPrograms=createHash('sha256').update(original.subarray(strings.end,cff.offset+cff.length)).digest('hex'),derivedPrograms=createHash('sha256').update(protectedCff).digest('hex');
if(originalPrograms!==derivedPrograms)throw new Error('Original CFF glyph-program bytes changed.');
bytes.writeUInt32BE(0,head.offset+8);
for(/** Per-table SFNT checksums use a zero adjustment field for the original head table. */const table of tables.values())bytes.writeUInt32BE(fontChecksum(bytes,table.offset,table.length),table.record+4);
bytes.writeUInt32BE((CHECKSUM_TARGET-fontChecksum(bytes,0,bytes.length))>>>0,head.offset+8);
if(fontChecksum(bytes,0,bytes.length)!==CHECKSUM_TARGET)throw new Error('The derived whole-font checksum is invalid.');
await writeFile(OUTPUT,bytes);
/** Modern Hangul advance adaptation does not imply original glyph-shape or full-face equivalence. */
const report={kind:'reproducible-korean-metric-font',source:original.toString('ascii',names.objects[0].from,names.objects[0].to)+'.otf',upstreamRevision:'f8d157532fbfaeda587e826d4cd5b21a49186f7c',sourceSha256,output:path.basename(OUTPUT),outputSha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,derivedFamily:'Fhan Sans KR',changedModernHangulGlyphs:11172,changedHangulGlyphs:changedGlyphs.size,originalAdvance:920,derivedAdvance:units,unitsPerEm:units,hangulDictionaryIndex:hangul.index,changedCffDefaultWidth:{from:defaultWidth.from,to:defaultWidth.to,original:defaultWidth.value,derived:units},renamedNames,renamedCffNames,originalProtectedCffSha256:originalPrograms,derivedProtectedCffSha256:derivedPrograms,glyphProgramsUnchanged:true,originalLegalNameFieldsUnchanged:true,otherScriptsMetricsUnchanged:true};
await writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
