import type {Editor,JSONContent} from '@tiptap/core';
import type {Node as ProseMirrorNode,Mark} from '@tiptap/pm/model';
import {TextSelection,AllSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import {closeHistory} from '@tiptap/pm/history';
import {defaultFontSize} from '../formatting.ts';
import {hasCharacterMark} from '../character-defaults.ts';

/** The independent body-format choices currently represented by the editable source schema. */
export type FormatPainterMode='character'|'paragraph'|'both';
/** Explicit dialog choices remain separate from the immutable copied source. */
export interface FormatPainterOptions {mode:FormatPainterMode;cellBackground:boolean;cellOnly:boolean;}
/** Copied appearance contains no source identifiers, text, hyperlinks, dimensions or document ownership. */
export interface FormatPainterSource {
  marks:NonNullable<JSONContent['marks']>;
  paragraph:Record<string,unknown>;
  cellBackground:string|null|undefined;
}
/** Only character appearance marks can overwrite target appearance; links retain their own destination. */
const CHARACTER_MARKS=new Set(['bold','italic','underline','strike','textStyle','superscript','subscript','code']);
/** Paragraph-shape fields exclude authored page breaks, source identities and semantic heading levels. */
const PARAGRAPH_FIELDS=['textAlign','lineHeight','marginLeft','marginRight','marginTop','marginBottom','textIndent','nativeSnapToGrid','nativeParagraphCondense','nativeBreakLatinWord','nativeBreakNonLatinWord'] as const;

/**
 * Locate the source cell containing a collapsed original text cursor.
 *
 * Ancestor inspection never selects a table or borrows its merge dimensions.
 * @param {Editor} editor - Actual owning source editor.
 * @returns {ProseMirrorNode|null} Original containing cell or no table context.
 * @example
 * const cell=sourceCell(editor);
 */
function sourceCell(editor:Editor):ProseMirrorNode|null{
  /** The current resolved source cursor retains its real table ancestry. */
  const position=editor.state.selection.$from;
  for(let depth=position.depth;depth>0;depth--){
    /** Only actual cells and header cells own copyable cell appearance. */
    const node=position.node(depth);
    if(node.type.name==='tableCell'||node.type.name==='tableHeader')return node;
  }
  return null;
}

/**
 * Snapshot the appearance immediately preceding the original source cursor.
 *
 * At a paragraph start its first character supplies the format. Empty blocks
 * use the actual stored insertion marks. Inherited font size, family and body
 * color become explicit so applying them cannot inherit a different target.
 * The deep snapshot survives document replacement without retaining source IDs.
 * @param {Editor} editor - Actual source editor with a collapsed text cursor.
 * @returns {FormatPainterSource|null} Independent copied appearance or no eligible source cursor.
 * @example
 * const source=captureFormatPainter(editor); // Does not edit the document or its history.
 */
export function captureFormatPainter(editor:Editor):FormatPainterSource|null{
  /** Composition and non-text selections keep their existing native ownership. */
  const selection=editor.state.selection;
  if(editor.view.composing||!(selection instanceof TextSelection)||!selection.empty||!['paragraph','heading'].includes(selection.$from.parent.type.name))return null;
  /** The preceding real character has priority over an unrelated future typing draft. */
  const position=selection.$from,block=position.parent,
    original:readonly Mark[]=position.nodeBefore?.isText?position.nodeBefore.marks:position.nodeAfter?.isText?position.nodeAfter.marks:editor.state.storedMarks??position.marks(),
    marks:NonNullable<JSONContent['marks']>=[];
  for(/** Semantic links never become copied character appearance. */const mark of original)if(CHARACTER_MARKS.has(mark.type.name))marks.push(mark.toJSON());
  /** Missing character attributes inherit original source defaults, independently from the destination block. */
  let style:NonNullable<JSONContent['marks']>[number]|undefined;
  for(/** An existing text-style snapshot retains all seven native language slots. */const mark of marks)if(mark.type==='textStyle')style=mark;
  if(!style){style={type:'textStyle',attrs:{}};marks.push(style);}
  /** Actual source hyperlink defaults belong to appearance without copying the link's semantic destination. */
  let sourceLink:Mark|undefined;
  for(/** The actual source URL is inspected only for its visual default, never copied to the target. */const mark of original)if(mark.type.name==='link')sourceLink=mark;
  style.attrs={...style.attrs,fontFamily:style.attrs?.fontFamily??'함초롬바탕',fontSize:style.attrs?.fontSize??`${defaultFontSize(block.type.name==='heading'?block.attrs.level:0)}pt`,color:style.attrs?.color??(sourceLink?'#0000ff':'#000000')};
  if(block.type.name==='heading'&&style.attrs.nativeNormalWeight!==true&&!hasCharacterMark(marks,'bold'))marks.push({type:'bold'});
  style.attrs.nativeNormalWeight=!hasCharacterMark(marks,'bold');
  if(sourceLink&&sourceLink.attrs.nativeDefaultUnderline!==false&&!hasCharacterMark(marks,'underline'))marks.push({type:'underline'});
  /** Native paragraph shape remains independent from the original paragraph's identity. */
  const paragraph:Record<string,unknown>={};
  for(/** Every represented paragraph property is copied, including its explicit default reset. */const key of PARAGRAPH_FIELDS)paragraph[key]=block.attrs[key]??(key==='textAlign'?'justify':key==='lineHeight'?'1.6':null);
  /** An absent cell stays distinguishable from an actual cell with no fill. */
  const cell=sourceCell(editor);
  return structuredClone({marks,paragraph,cellBackground:cell?cell.attrs.backgroundColor??null:undefined});
}

/**
 * Apply copied character, paragraph and supported cell appearance in one undo step.
 *
 * Text and hyperlinks stay in their original order. Source identities, heading
 * levels, manual page breaks, cell spans and widths remain target properties.
 * Cell selections use their real rectangle; ordinary selections touch only the
 * paragraphs and cells they actually intersect. A paragraph ending exactly at
 * the next paragraph's start does not format that unselected paragraph.
 * @param {Editor} editor - Actual target editor with a nonempty source selection.
 * @param {FormatPainterSource} source - Independent previously copied source appearance.
 * @param {FormatPainterOptions} options - Explicit accepted format-copy choices.
 * @returns {boolean} Whether at least one actual document appearance change was committed.
 * @throws {RangeError} If a copied mark is incompatible with the active schema.
 * @example
 * applyFormatPainter(editor,source,{mode:'both',cellBackground:false,cellOnly:false});
 */
export function applyFormatPainter(editor:Editor,source:FormatPainterSource,options:FormatPainterOptions):boolean{
  /** No composition, collapsed cursor or structural node selection is rewritten by a paste operation. */
  const state=editor.state,selection=state.selection;
  if(editor.view.composing||selection.empty||!(selection instanceof TextSelection||selection instanceof AllSelection||selection instanceof CellSelection))return false;
  /** An explicit history boundary separates this formatting operation from earlier typing. */
  const transaction=closeHistory(state.tr),paragraphs=new Set<number>(),cells=new Set<number>();
  /**
   * Apply the copied fill to one exact original target cell at most once.
   *
   * Parent cells of nested tables cannot be borrowed from broad range ancestry.
   * @param {ProseMirrorNode} cell - Actual selected target cell.
   * @param {number} position - Its original absolute node position.
   * @returns {void} Appends only the supported background attribute change.
   * @example
   * // A rectangular CellSelection supplies only its actual selected cells.
   */
  function fillCell(cell:ProseMirrorNode,position:number):void{
    if(!options.cellBackground||source.cellBackground===undefined||cells.has(position))return;
    cells.add(position);transaction.setNodeMarkup(position,undefined,{...cell.attrs,backgroundColor:source.cellBackground},cell.marks);
  }
  if(selection instanceof CellSelection)selection.forEachCell(fillCell);
  for(/** Actual disjoint cell ranges must not include unselected cells between their numeric endpoints. */const range of selection.ranges){
    /** Target source endpoints remain unchanged because no character or node is inserted. */
    const from=range.$from.pos,to=range.$to.pos;
    if(!options.cellOnly&&(options.mode==='character'||options.mode==='both')){
      for(/** Only known appearance types are cleared; target links and other semantic marks survive. */const name of CHARACTER_MARKS){
        /** Unsupported character marks cannot be introduced into a different editor schema. */
        const type=state.schema.marks[name];if(type)transaction.removeMark(from,to,type);
      }
      for(/** Copied complete text-style fields include default resets and all native language arrays. */const mark of source.marks){
        if(!CHARACTER_MARKS.has(mark.type))continue;
        /** Source snapshots retain JSON values rather than old mutable mark instances. */
        const type=state.schema.marks[mark.type];if(type)transaction.addMark(from,to,type.create(structuredClone(mark.attrs)));
      }
    }
    state.doc.nodesBetween(from,to,
      /**
       * Apply source paragraph shape and supported cell fill to intersecting original nodes.
       *
       * Node dimensions, identifiers, manual breaks and child content remain unchanged.
       * @param {ProseMirrorNode} node - Actual selected target node.
       * @param {number} position - Original absolute target-node start.
       * @returns {void} Appends position-preserving node-attribute changes.
       * @example
       * // Two selected cells receive the source fill without changing their colspan.
       */
      (node,position)=>{
        if(!options.cellOnly&&(options.mode==='character'||options.mode==='both')&&node.isText){
          for(/** Each actual target URL is retained while its automatic underline becomes explicit copied character appearance. */const mark of node.marks)if(mark.type.name==='link')transaction.addMark(Math.max(from,position),Math.min(to,position+node.nodeSize),mark.type.create({...mark.attrs,nativeDefaultUnderline:false}));
        }
        if(!options.cellOnly&&(options.mode==='paragraph'||options.mode==='both')&&['paragraph','heading'].includes(node.type.name)&&!paragraphs.has(position)){
          paragraphs.add(position);
          transaction.setNodeMarkup(position,undefined,{...node.attrs,...structuredClone(source.paragraph)},node.marks);
        }
        if(!(selection instanceof CellSelection)&&node.isTextblock){
          /** Each actual selected text block belongs to its nearest original cell, including nested tables. */
          const point=state.doc.resolve(position+1);
          for(let depth=point.depth;depth>0;depth--){
            /** A nested table's parent cell cannot replace its real current-cell ownership. */
            const cell=point.node(depth);
            if(cell.type.name==='tableCell'||cell.type.name==='tableHeader'){fillCell(cell,point.before(depth));break;}
          }
        }
      },
    );
  }
  if(!transaction.docChanged||transaction.doc.eq(state.doc))return false;
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory',false));
  editor.view.focus();
  return true;
}
