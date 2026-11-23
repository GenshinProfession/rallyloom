/** Explicit placements reserve indexes; old room-only assignments fill remaining indexes. */
export function seatOrder<T extends {id:string}>(members: readonly T[], capacity:number, pinned:Record<string,number> = {}): (T | undefined)[] {
  const seats:(T|undefined)[]=Array.from({length:capacity})
  const waiting:T[]=[]
  for(const member of members){
    const index=pinned[member.id]
    if(Number.isInteger(index)&&index>=0&&index<capacity&&!seats[index])seats[index]=member
    else waiting.push(member)
  }
  for(const member of waiting){const index=seats.findIndex(value=>!value);if(index<0)break;seats[index]=member}
  return seats
}
