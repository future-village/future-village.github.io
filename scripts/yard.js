'use strict';
const YARD_DEFAULTS=Object.freeze({tree:'tree_round',lamp:'lamp',fence:'fence'});
const YARD_OPTIONS=Object.freeze({tree:['tree_round','tree_pine'],lamp:['lamp'],fence:['fence']});
function yardIssues(yard){
 if(yard===undefined)return [];
 if(!yard||typeof yard!=='object'||Array.isArray(yard))return ['yard 須為物件'];
 const issues=Object.keys(yard).filter(k=>!Object.hasOwn(YARD_OPTIONS,k)).map(k=>'yard.'+k+' 不收此鍵');
 for(const [k,values] of Object.entries(YARD_OPTIONS))if(Object.hasOwn(yard,k)&&!values.includes(yard[k]))issues.push('yard.'+k+' 不在白名單');
 return issues;
}
function resolveYard(yard){const issues=yardIssues(yard);if(issues.length)throw new Error(issues.join('；'));return {...YARD_DEFAULTS,...yard};}
module.exports={YARD_DEFAULTS,YARD_OPTIONS,yardIssues,resolveYard};
