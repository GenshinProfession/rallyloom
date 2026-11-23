import {useEffect,useRef,type RefObject} from 'react'
import type {OfficeLayout,WallSegment} from './rooms/api'
import {snapWallPoint,wallLength} from './rooms/free-walls'
import type {createOfficeView,OfficeOverlay} from './three/view'

type Point=WallSegment['start']
type Scene=NonNullable<ReturnType<typeof createOfficeView>>
export interface FreeWallEditing {
  active:boolean
  selected?:string
  disabled:boolean
  add:(wall:WallSegment)=>boolean
  update:(wall:WallSegment)=>void
  select:(id:string)=>void
  finish:()=>void
}
export function OfficeFreeWalls({stage,engine,layout,editing,overlay}:{stage:RefObject<HTMLDivElement|null>;engine:RefObject<Scene|null>;layout:OfficeLayout;editing:FreeWallEditing;overlay?:OfficeOverlay}){
  const latest=useRef({layout,editing});latest.current={layout,editing}
  const chain=useRef<Point|undefined>(undefined),cancel=useRef<()=>void>(()=>{}),skipClick=useRef(false)
  const handles=useRef<Record<string,HTMLButtonElement|null>>({})
  const at=(event:PointerEvent)=>{const bounds=stage.current?.getBoundingClientRect();return bounds?engine.current?.floorPoint(event.clientX-bounds.left,event.clientY-bounds.top):null}
  const inside=(point:Point)=>point.x>=0&&point.y>=0&&point.x<=latest.current.layout.width&&point.y<=latest.current.layout.height
  const preview=(wall?:WallSegment)=>engine.current?.previewWall(wall)
  function transform(event:PointerEvent,wall:WallSegment,handle:'start'|'end'|'body'){
    if(event.button!==0||latest.current.editing.disabled)return
    const origin=at(event);if(!origin)return
    event.preventDefault();event.stopPropagation();cancel.current();skipClick.current=true
    latest.current.editing.select(wall.id)
    let next=wall,moved=false
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==event.pointerId)return
      const point=at(e);if(!point)return
      moved=moved||Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)>3
      const config=latest.current.layout
      if(handle==='body'){
        const dx=Math.max(-Math.min(wall.start.x,wall.end.x),Math.min(config.width-Math.max(wall.start.x,wall.end.x),point.x-origin.x))
        const dy=Math.max(-Math.min(wall.start.y,wall.end.y),Math.min(config.height-Math.max(wall.start.y,wall.end.y),point.y-origin.y))
        next={...wall,start:{x:Math.round(wall.start.x+dx),y:Math.round(wall.start.y+dy)},end:{x:Math.round(wall.end.x+dx),y:Math.round(wall.end.y+dy)}}
      }else next={...wall,[handle]:snapWallPoint(point,config,handle==='start'?wall.end:wall.start,e.shiftKey)}
      preview(next)
      for(const key of ['start','end'] as const){const screen=engine.current?.screenPoint(next[key].x,next[key].y),button=handles.current[key];if(screen&&button){button.style.left=screen.left+'px';button.style.top=screen.top+'px'}}
    }
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);preview();cancel.current=()=>{}}
    const up=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;stop();if(moved&&wallLength(next)>=12)latest.current.editing.update(next)}
    cancel.current=stop;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop)
  }
  useEffect(()=>{
    const root=stage.current;if(!root)return
    const pointerDown=(event:PointerEvent)=>{
      if(!(event.target instanceof HTMLCanvasElement)||latest.current.editing.disabled||event.button!==0)return
      if(!latest.current.editing.active){
        const bounds=root.getBoundingClientRect(),id=engine.current?.pickWall(event.clientX-bounds.left,event.clientY-bounds.top)
        const wall=latest.current.layout.wallSegments?.find(wall=>wall.id===id)
        if(wall)transform(event,wall,'body')
        return
      }
      const point=at(event);if(!point||!inside(point))return
      event.preventDefault();event.stopPropagation();cancel.current();skipClick.current=true
      const origin=chain.current??snapWallPoint(point,latest.current.layout)
      let endpoint=origin,moved=false
      const make=():WallSegment=>({id:crypto.randomUUID(),start:origin,end:endpoint,height:26,thickness:6,finish:'solid'})
      const move=(e:PointerEvent)=>{if(e.pointerId!==event.pointerId)return;const p=at(e);if(!p)return;moved=moved||Math.hypot(e.clientX-event.clientX,e.clientY-event.clientY)>4;endpoint=snapWallPoint(p,latest.current.layout,origin,e.shiftKey);preview(make())}
      const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',abort);window.removeEventListener('blur',abort);preview();cancel.current=()=>{}}
      const abort=()=>{stop();chain.current=undefined}
      const up=(e:PointerEvent)=>{
        if(e.pointerId!==event.pointerId)return
        const p=at(e);if(p)endpoint=snapWallPoint(p,latest.current.layout,origin,e.shiftKey)
        stop()
        if(!p||!inside(p)){chain.current=undefined;return}
        if(moved||chain.current){const wall=make();if(wallLength(wall)>=12){chain.current=latest.current.editing.add(wall)?endpoint:undefined}}
        else chain.current=origin
      }
      cancel.current=abort;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',abort);window.addEventListener('blur',abort)
    }
    const hover=(event:PointerEvent)=>{if(!latest.current.editing.active||!chain.current||event.buttons)return;const p=at(event);if(p&&inside(p))preview({id:'preview',start:chain.current,end:snapWallPoint(p,latest.current.layout,chain.current,event.shiftKey),height:26,thickness:6,finish:'solid'})}
    const click=(event:MouseEvent)=>{if(skipClick.current||latest.current.editing.active){event.stopPropagation();skipClick.current=false}}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'||event.key==='Enter'){cancel.current();chain.current=undefined;preview();if(latest.current.editing.active)latest.current.editing.finish()}}
    const blur=()=>{cancel.current();chain.current=undefined;preview()}
    root.addEventListener('pointerdown',pointerDown,true);root.addEventListener('pointermove',hover);root.addEventListener('click',click,true);window.addEventListener('keydown',key);window.addEventListener('blur',blur)
    return()=>{cancel.current();root.removeEventListener('pointerdown',pointerDown,true);root.removeEventListener('pointermove',hover);root.removeEventListener('click',click,true);window.removeEventListener('keydown',key);window.removeEventListener('blur',blur)}
  },[])
  useEffect(()=>{if(!editing.active){cancel.current();chain.current=undefined;preview()}},[editing.active])
  useEffect(()=>{if(editing.active&&chain.current){chain.current=layout.wallSegments?.at(-1)?.end;preview()}},[layout.wallSegments])
  const wall=layout.wallSegments?.find(wall=>wall.id===editing.selected)
  if(!wall||editing.active||!overlay)return null
  return <div className="office-free-wall-handles">{(['start','end'] as const).map(key=>{
    const screen=engine.current?.screenPoint(wall[key].x,wall[key].y)
    return screen&&<button key={key} ref={node=>{handles.current[key]=node}} className="office-wall-node" data-wall-node={key} type="button" aria-label={key==='start'?'拖动墙起点':'拖动墙终点'} style={{left:screen.left,top:screen.top}} onPointerDown={event=>transform(event.nativeEvent,wall,key)}
      onKeyDown={event=>{const delta={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[event.key];if(!delta)return;event.preventDefault();latest.current.editing.update({...wall,[key]:snapWallPoint({x:wall[key].x+delta[0],y:wall[key].y+delta[1]},layout)})}}/>})}</div>
}
