"use strict";
const crypto=require('crypto');
function token(req,res) {
  let value=req.cookies?.ln_csrf;
  if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value)) {
    value=crypto.randomBytes(32).toString('hex');
    res.cookie('ln_csrf',value,{httpOnly:true,sameSite:'strict',secure:req.secure,path:'/'});
  }
  return value;
}
function valid(req) {
  if(req.get('sec-fetch-site')==='cross-site')return false;
  const a=req.cookies?.ln_csrf,b=req.get('x-csrf-token')||req.body?._csrf;
  return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
module.exports={token,valid};
