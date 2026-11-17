// Chart gap helper; section charts draw each returned run independently without interpolation.
export function lineSegments<T extends {y:number|null}>(points:readonly T[]):T[][] {
  const segments:T[][]=[];
  let run:T[]=[];
  for(const point of points) {
    if(point.y===null) {run=[];continue;}
    if(run.length===0) segments.push(run);
    run.push(point);
  }
  return segments;
}
