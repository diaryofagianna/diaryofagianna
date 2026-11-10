(function(root){
'use strict';
function mergeValue(local,cloud){
 if(Array.isArray(local)&&Array.isArray(cloud)){
  const objectItems=local.concat(cloud).some(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.id!=null);
  if(objectItems){
   const map=new Map();
   cloud.forEach((item,i)=>map.set(item&&item.id!=null?'id:'+item.id:'cloud:'+i,item));
   local.forEach((item,i)=>{
    const key=item&&item.id!=null?'id:'+item.id:'local:'+i,old=map.get(key);
    if(old&&item&&typeof item==='object'&&!Array.isArray(item))map.set(key,mergeValue(item,old));
    else if(!old)map.set(key,item);
   });
   return Array.from(map.values());
  }
  const out=cloud.slice(),seen=new Set(cloud.map(v=>JSON.stringify(v)));
  local.forEach(v=>{const k=JSON.stringify(v);if(!seen.has(k)){seen.add(k);out.push(v)}});
  return out;
 }
 if(local&&cloud&&typeof local==='object'&&typeof cloud==='object'&&!Array.isArray(local)&&!Array.isArray(cloud)){
  const out={...cloud};Object.keys(local).forEach(k=>{out[k]=Object.prototype.hasOwnProperty.call(cloud,k)?mergeValue(local[k],cloud[k]):local[k]});return out;
 }
 return local===undefined?cloud:local;
}
function mergeData(local,cloud){return mergeValue(local||{},cloud||{})}
root.WorkbenchCloudCore={mergeData};
if(typeof module!=='undefined'&&module.exports)module.exports=root.WorkbenchCloudCore;
})(typeof window!=='undefined'?window:globalThis);
