import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Crop,
  Download,
  Maximize2,
  Monitor,
  MousePointerSquareDashed,
  X,
  ZoomIn,
} from 'lucide-react';
import { MockScreenshot, type CaptureFlow } from './capture';
import { useActions } from '../mock/store';
import { toast } from './toast';
import './captureOverlay.css';

// Full clickable capture flow, themeable via `accent`. Driven by a
// useCaptureFlow() instance owned by the prototype.
export function CaptureOverlay({ flow, accent = '#7c5cff' }: { flow: CaptureFlow; accent?: string }) {
  const actions = useActions();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [crop, setCrop] = useState({ x: 6, y: 6, w: 88, h: 88 });
  const [scale, setScale] = useState(100);

  useEffect(() => {
    if (flow.phase !== 'preview') {
      setEditing(false);
      setEnlarged(false);
      setCopied(false);
      setCrop({ x: 6, y: 6, w: 88, h: 88 });
      setScale(100);
    }
  }, [flow.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && flow.phase !== 'idle') flow.reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flow]);

  if (flow.phase === 'idle') return null;

  const copy = () => {
    setCopied(true);
    toast('Copied to clipboard', { tone: 'success', detail: 'PNG · 3840×2160' });
    window.setTimeout(() => setCopied(false), 1600);
  };
  const save = () => flow.shot && actions.saveCapture(flow.shot.id);

  return (
    <div className="cap" style={{ ['--accent' as string]: accent }}>
      {/* CHOOSE -------------------------------------------------------- */}
      {flow.phase === 'choose' && (
        <div className="cap__choose" onMouseDown={flow.reset}>
          <div className="cap__chooser" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="cap__chtitle">What do you want to capture?</h3>
            <div className="cap__chgrid">
              <button className="cap__chcard" onClick={() => flow.choose('fullscreen')}>
                <Monitor size={26} />
                <span className="cap__chname">Fullscreen</span>
                <span className="cap__chmeta">Ctrl ⇧ 3</span>
              </button>
              <button className="cap__chcard" onClick={() => flow.choose('area')}>
                <MousePointerSquareDashed size={26} />
                <span className="cap__chname">Select area</span>
                <span className="cap__chmeta">Ctrl ⇧ 4</span>
              </button>
            </div>
            <button className="cap__cancel" onClick={flow.reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* SELECT -------------------------------------------------------- */}
      {flow.phase === 'select' && (
        <div className="cap__select" {...flow.selectionProps}>
          <div className="cap__selhint">Drag to select a region · Esc to cancel</div>
          {flow.region && (
            <div
              className="cap__selrect"
              style={{
                left: `${flow.region.x * 100}%`,
                top: `${flow.region.y * 100}%`,
                width: `${flow.region.w * 100}%`,
                height: `${flow.region.h * 100}%`,
              }}
            >
              <span className="cap__seldim">
                {Math.round(flow.region.w * 3840)} × {Math.round(flow.region.h * 2160)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* PREVIEW ------------------------------------------------------- */}
      {flow.phase === 'preview' && flow.shot && (
        <div className="cap__preview" onMouseDown={flow.reset}>
          <div className="cap__pcard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="cap__phead">
              <span className="cap__pbadge">{flow.shot.mode === 'area' ? 'Area' : 'Fullscreen'}</span>
              <span className="cap__pmeta">
                {flow.shot.region
                  ? `${flow.shot.region.w} × ${flow.shot.region.h}px`
                  : '3840 × 2160px'}
              </span>
              {flow.shot.savedPath && <span className="cap__psaved">saved ✓</span>}
              <button className="cap__pclose" onClick={flow.reset}>
                <X size={16} />
              </button>
            </div>

            <div className="cap__pstage">
              <MockScreenshot
                shot={flow.shot}
                className="cap__pshot"
                crop={
                  editing
                    ? { x: crop.x / 100, y: crop.y / 100, w: crop.w / 100, h: crop.h / 100 }
                    : null
                }
                style={{ transform: `scale(${scale / 100})` }}
              />
            </div>

            {editing ? (
              <div className="cap__editor">
                <div className="cap__editrow">
                  <label>Crop X</label>
                  <input type="range" min={0} max={40} value={crop.x} onChange={(e) => setCrop((c) => ({ ...c, x: +e.target.value }))} />
                  <label>W</label>
                  <input type="range" min={20} max={100} value={crop.w} onChange={(e) => setCrop((c) => ({ ...c, w: +e.target.value }))} />
                </div>
                <div className="cap__editrow">
                  <label>Crop Y</label>
                  <input type="range" min={0} max={40} value={crop.y} onChange={(e) => setCrop((c) => ({ ...c, y: +e.target.value }))} />
                  <label>H</label>
                  <input type="range" min={20} max={100} value={crop.h} onChange={(e) => setCrop((c) => ({ ...c, h: +e.target.value }))} />
                </div>
                <div className="cap__editrow">
                  <label>Scale</label>
                  <input type="range" min={40} max={140} value={scale} onChange={(e) => setScale(+e.target.value)} />
                  <span className="cap__scaleval tnum">{scale}%</span>
                </div>
                <div className="cap__editactions">
                  <button className="cap__btn" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button
                    className="cap__btn cap__btn--primary"
                    onClick={() => {
                      setEditing(false);
                      toast('Edits applied', { tone: 'success' });
                    }}
                  >
                    <Check size={14} /> Apply
                  </button>
                </div>
              </div>
            ) : (
              <div className="cap__actions">
                <button className="cap__btn" onClick={copy}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button className="cap__btn" onClick={save} disabled={!!flow.shot.savedPath}>
                  <Download size={15} />
                  {flow.shot.savedPath ? 'Saved' : 'Save to desktop'}
                </button>
                <button className="cap__btn" onClick={() => setEditing(true)}>
                  <Crop size={15} /> Edit
                </button>
                <button className="cap__btn" onClick={() => setEnlarged(true)}>
                  <Maximize2 size={15} /> Enlarge
                </button>
                <button className="cap__btn cap__btn--primary" onClick={() => flow.start()}>
                  New capture
                </button>
              </div>
            )}

            {flow.shot.savedPath && (
              <div className="cap__path">
                <Download size={12} /> {flow.shot.savedPath}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ENLARGE ------------------------------------------------------- */}
      {enlarged && flow.shot && (
        <div className="cap__enlarge" onMouseDown={() => setEnlarged(false)}>
          <MockScreenshot shot={flow.shot} className="cap__enshot" />
          <button className="cap__enclose">
            <ZoomIn size={14} /> click anywhere to close
          </button>
        </div>
      )}
    </div>
  );
}
