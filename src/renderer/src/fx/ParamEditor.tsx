/**
 * Attribute/text editor for the selected tree node. Every attribute is an
 * editable string (no schema). Nodes tagged ColorOverLife/ColorOverDistance
 * whose text parses as keyframes get the GradientEditor instead of the
 * plain text field; a parse failure falls back to text + inline warning.
 */
import type { EffectDocument } from '../../../core/fx/effectXml'
import { nodeAttributes, nodeTag, nodeText } from '../../../core/fx/effectXml'
import type { ColorKeyframe } from '../../../core/fx/colorOverLife'
import { formatColorKeyframes, parseColorKeyframes } from '../../../core/fx/colorOverLife'
import type { NodePath } from '../state/fxEdit'
import { getNodeAtPath } from '../state/fxEdit'
import { CommitInput } from './CommitInput'
import { GradientEditor } from './GradientEditor'

const GRADIENT_TAGS = ['ColorOverLife', 'ColorOverDistance']

interface ParamEditorProps {
  readonly doc: EffectDocument
  readonly path: NodePath
  readonly onAttributeCommit: (key: string, value: string) => void
  readonly onTextCommit: (text: string) => void
}

interface GradientParse {
  readonly frames: readonly ColorKeyframe[] | null
  readonly warning: string | null
}

function tryParseGradient(tag: string, text: string): GradientParse {
  if (!GRADIENT_TAGS.includes(tag)) return { frames: null, warning: null }
  try {
    return { frames: parseColorKeyframes(text), warning: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return { frames: null, warning: `無法解析漸層資料：${message}` }
  }
}

export function ParamEditor({
  doc,
  path,
  onAttributeCommit,
  onTextCommit
}: ParamEditorProps): React.JSX.Element {
  const node = getNodeAtPath(doc, path)
  const tag = nodeTag(node)
  const attributes = Object.entries(nodeAttributes(node))
  const text = nodeText(node)
  const { frames, warning } = tryParseGradient(tag, text)
  const showsTextEditor = frames === null && (text !== '' || warning !== null)

  return (
    <section className="fx-params">
      <div className="panel-title">節點屬性：{tag}</div>
      {attributes.length === 0 && <p className="panel-empty">此節點沒有屬性</p>}
      {attributes.map(([key, value]) => (
        <label key={key} className="field fx-attr-field">
          <span className="field-label">{key}</span>
          <CommitInput
            value={value}
            ariaLabel={key}
            onCommit={(nextValue) => onAttributeCommit(key, nextValue)}
          />
        </label>
      ))}
      {frames !== null && (
        <div className="fx-text-block">
          <div className="panel-title">漸層停駐點</div>
          <GradientEditor
            frames={frames}
            onCommit={(nextFrames) => onTextCommit(formatColorKeyframes(nextFrames))}
          />
        </div>
      )}
      {showsTextEditor && (
        <div className="fx-text-block">
          <div className="panel-title">內容文字</div>
          {warning && <span className="field-error">{warning}</span>}
          <CommitInput value={text} ariaLabel="內容文字" onCommit={onTextCommit} />
        </div>
      )}
    </section>
  )
}
