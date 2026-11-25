import {Trash2,DoorOpen,BetweenHorizontalStart} from 'lucide-react'
import {Switch} from '@/components/ui/switch'
import type {WallSegment} from './rooms/api'
import {wallLength} from './rooms/free-walls'

const DEGREES = 180 / Math.PI

export function OfficeWallInspector({wall,disabled,onChange,onDelete}:{wall:WallSegment;disabled:boolean;onChange:(wall:WallSegment)=>void;onDelete:()=>void}){
  const length=wallLength(wall)
  const angle=(Math.atan2(wall.end.y-wall.start.y,wall.end.x-wall.start.x)*DEGREES+360)%360

  // 画完发现歪了不必重画：在这里直接改长度/角度（起点不动），或用「水平 / 垂直」一键摆正。
  const place=(nextLength:number,nextAngle:number)=>{
    const clamped=Math.max(12,Math.round(nextLength))
    const radians=(Math.round(nextAngle)%360)*Math.PI/180
    onChange({...wall,end:{x:Math.round(wall.start.x+Math.cos(radians)*clamped),y:Math.round(wall.start.y+Math.sin(radians)*clamped)}})
  }

  return <section className="office-wall-inspector">
    <div className="office-inspector-heading"><h2><BetweenHorizontalStart size={15}/>独立墙段</h2><span>{Math.round(length)} 长度</span></div>
    <p>拖动两端圆点调整形状，拖动墙体整体移位。下方可直接改长度与角度，起点保持不动。</p>
    <div className="office-wall-endpoints">{(['start','end']as const).map((key,index)=><div key={key}><h3>{index?'终点':'起点'}</h3>{(['x','y']as const).map(axis=><label key={axis}><span>{axis.toUpperCase()}</span><input type="number" aria-label={`墙${index?'终点':'起点'}${axis.toUpperCase()}`} value={wall[key][axis]} disabled={disabled} onChange={event=>onChange({...wall,[key]:{...wall[key],[axis]:event.target.valueAsNumber}})}/></label>)}</div>)}</div>
    <div className="office-wall-measures">
      <label>长度<input type="number" aria-label="墙段长度" min={12} value={Math.round(length)} disabled={disabled} onChange={event=>place(event.target.valueAsNumber,angle)}/></label>
      <label>角度<input type="number" aria-label="墙段角度" min={0} max={359} step={1} value={Math.round(angle)} disabled={disabled} onChange={event=>place(length,event.target.valueAsNumber)}/></label>
    </div>
    <div className="office-wall-align" role="group" aria-label="墙段方向校正">
      <button type="button" disabled={disabled} aria-pressed={Math.round(angle)%180===0} onClick={()=>place(length,0)}>水平</button>
      <button type="button" disabled={disabled} aria-pressed={Math.round(angle)===90||Math.round(angle)===270} onClick={()=>place(length,90)}>垂直</button>
      <button type="button" disabled={disabled} onClick={()=>place(length,45)}>45°</button>
      <button type="button" disabled={disabled} onClick={()=>place(length,135)}>135°</button>
    </div>
    <div className="office-wall-measures">{([['thickness','厚度',2,24],['height','高度',8,100]]as const).map(([key,label,min,max])=><label key={key}>{label}<input type="number" aria-label={'墙体'+label} min={min} max={max} value={wall[key]} disabled={disabled} onChange={event=>onChange({...wall,[key]:event.target.valueAsNumber})}/></label>)}</div>
    <h3>墙体材质</h3><div className="office-wall-materials" role="group" aria-label="独立墙材质">{(['solid','glass']as const).map((finish,index)=><button key={finish} disabled={disabled} aria-pressed={wall.finish===finish} onClick={()=>onChange({...wall,finish})}><i data-finish={finish}/>{index?'通透玻璃':'暖灰实体'}</button>)}</div>
    <div className="office-wall-opening"><label><span><DoorOpen size={14}/>留出门洞</span><Switch aria-label="墙段门洞" disabled={disabled||length<36} checked={!!wall.opening} onCheckedChange={checked=>onChange({...wall,opening:checked?{offset:.5,width:Math.min(42,Math.floor(length-12))}:undefined})}/></label>
    {wall.opening&&<><label>位置<input aria-label="独立门洞位置" type="range" min={Math.ceil((6+wall.opening.width/2)/length*100)} max={Math.floor((length-6-wall.opening.width/2)/length*100)} value={Math.round(wall.opening.offset*100)} disabled={disabled} onChange={event=>onChange({...wall,opening:{...wall.opening!,offset:event.target.valueAsNumber/100}})}/></label><label>门宽<input aria-label="独立门洞宽度" type="number" min={12} max={Math.floor(2*Math.min(wall.opening.offset,1-wall.opening.offset)*length-12)} value={wall.opening.width} disabled={disabled} onChange={event=>onChange({...wall,opening:{...wall.opening!,width:event.target.valueAsNumber}})}/></label></>}
    </div>
    <button type="button" className="office-delete-object" disabled={disabled} onClick={onDelete}><Trash2 size={14}/>删除墙段</button>
  </section>
}
