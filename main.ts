const fs=require('fs'),C='udlr';let W,N,fm,gm,Q=[],gi=[];
const K=n=>1n<<BigInt(n);
function P(t){let r=t.split('\n');W=Math.max(...r.map(s=>s.length))+2;N=W*(r.length+2);Q=[-W,W,-1,1];let g=0n,b=0n,y=-1;fm=0n;gi=[];for(let j in r)for(let x in r[j]){let c=r[j][x],i=(+j+1)*W+ +x+1,k=' .$*@+'.indexOf(c);if(k<0)continue;let z=K(i);fm|=z;if(k&1){g|=z;gi.push(i);}if(k>1)k<4?b|=z:y=i;}gm=g;return[b,g,y];}
function D(o,g){let l=g,q=gi.slice();for(let t of q)for(let d of Q){let p=t-d,n=p-d,z=K(p);if((o&z)&&(fm&K(n))&&!(l&z)){l|=z;q.push(p);}}return l;}
function F(p,b,x){let v=[],n=[],q=[p],rg=K(p);v[p]=-1;n[p]=1;for(let e of q)for(let k=0;k<4;k++){let m=e+Q[k],z=K(m);if(n[m]||!(fm&z)||(b&z)||(x&z))continue;n[m]=1;v[m]=e*4|k;rg|=z;q.push(m);}return[v,n,rg];}
function A(v,f,t){let s='',e=t;for(let p;e!=f;e=p>>2){p=v[e];s=C[p&3]+s;}return s;}
function S(o,b0,g,p,x){let l=D(o,g);if(b0&~l)return null;let B=[[[b0,p,'']]],V=new Set(),e=0;for(let c=0;c<B.length;c++)for(let i=0;i<B[c].length;i++){let s=B[c][i],b=s[0],pl=s[1],m=s[2];if(!(b&~g))return{m,e:pl};let f=F(pl,b,x),kk=b+':'+f[2];if(V.has(kk))continue;V.add(kk);if(++e>3e5)return null;let v=f[0],n=f[1];for(let u=b,j=0;u;u>>=1n,j++)if(u&1n)for(let d=0;d<4;d++){let pc=j-Q[d],tc=j+Q[d];if(!n[pc])continue;let tb=K(tc);if((o&tb)&&!(b&tb)&&(l&tb)){let nb=b^K(j)^tb;(B[c+1]??=[]).push([nb,j,m+A(v,pl,pc)+C[d]]);}}}return null;}
function R(bx,y){let h=(y/W|0),hm=0n,rs=[],sn=0n;for(let i=h*W;i<(h+1)*W;i++)hm|=K(i);for(let u=bx,j=0;u;u>>=1n,j++){if(!(u&1n)||(sn&K(j)))continue;let cp=F(j,0n,hm)[2];sn|=cp;rs.push({o:cp,b:bx&cp,g:gm&cp});}return rs;}
function L(t){let[b,g,y]=P(t);if(!(b&~g))return'';let r=R(b,y),m='',c=y,u=b;for(let o of r){let s=S(o.o,o.b,o.g,c,u^o.b);if(!s)return'';m+=s.m;c=s.e;u=u^o.b|o.g;}return m;}
function M(){let E=process.env,I=E.MAKEFUN_INPUT_DIR||'/input',O=E.MAKEFUN_OUTPUT_DIR||'/output';for(let id of fs.readdirSync(I)){let s='';try{s=L(''+fs.readFileSync(I+'/'+id+'/level.txt'));}catch{}let o=O+'/'+id;fs.mkdirSync(o,{recursive:true});fs.writeFileSync(o+'/solution.txt',s);}}
M();
