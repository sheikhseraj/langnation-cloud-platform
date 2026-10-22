'use strict';
const db=require('./db');
const fields=['invoice_recipient','invoice_company','invoice_address'];
const separate=['invoice_personal_address','invoice_company_address'];
class AddressError extends Error{constructor(message){super(message);this.name='AddressError';}}
const ready=()=>fields.every(field=>db.hasColumn('students.'+field));
const separateReady=()=>separate.every(field=>db.hasColumn('students.'+field));
const columns=()=> (db.hasColumn('students.city')?', city':'')+(ready()?', '+fields.join(', '):'')+(separateReady()?', '+separate.join(', '):'');
function address(who){const parts=[who.address,who.city,who.country].map(v=>String(v||'').trim()).filter(Boolean);return String(who.address||'').trim()||String(who.city||'').trim()?parts.join('\n'):'';}
function choices(who){
 const personalAddress=String(who.invoice_personal_address||(!who.invoice_personal_address&&who.invoice_recipient!=='company'?who.invoice_address:'')||address(who)).trim();
 const companyAddress=String(who.invoice_company_address||(who.invoice_recipient==='company'?who.invoice_address:'')||'').trim();
 return {personalAddress,companyAddress,company:String(who.invoice_company||'').trim(),name:who.name||''};
}
// A complete company recipient takes priority for newly issued invoices only.
function recipient(who){const v=choices(who);return v.company&&v.companyAddress?{name:v.company,address:v.companyAddress}:{name:who.name,address:v.personalAddress};}
function validate(body={}){
 const recipient=body.recipient,company=typeof body.company==='string'?body.company.trim():'',address=typeof body.address==='string'?body.address.replace(/\r\n?/g,'\n').trim():'';
 if(!['student','company'].includes(recipient))throw new AddressError('Choose a personal or company address.');
 if(company.length>200||/[\u0000-\u001f]/.test(company))throw new AddressError('Enter a company name on one line, up to 200 characters.');
 if(recipient==='company'&&!company)throw new AddressError('Enter the company name.');
 if(!address)throw new AddressError('Enter the complete address, including postcode, city and country.');
 if(address.length>400||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(address))throw new AddressError('Use an address of 400 characters or fewer.');
 return {recipient,company:recipient==='company'?company:null,address};
}
async function current(studentId){
 if(!db.isEnabled())return {ready:false,recipient:'student',company:'',address:'',personalAddress:'',companyAddress:'',name:''};
 const who=await db.queryOne('SELECT id, name, address, country'+columns()+' FROM students WHERE id = ? AND deleted_at IS NULL',[Number(studentId)])||{};
 const v=choices(who),bill=recipient(who),company=!!(v.company&&v.companyAddress);
 return {...v,ready:ready()&&separateReady(),recipient:company?'company':'student',address:bill.address};
}
async function save(studentId,body){
 if(!ready()||!separateReady())throw new AddressError('Address settings are unavailable until the database update finishes.');
 const value=validate(body),id=Number(studentId);if(!Number.isSafeInteger(id)||id<1)throw new AddressError('Please sign in again.');
 // Keep both addresses. Saving a personal address never erases the company.
 if(value.recipient==='company')await db.query('UPDATE students SET invoice_company = ?, invoice_company_address = ? WHERE id = ? AND deleted_at IS NULL',[value.company,value.address,id]);
 else await db.query('UPDATE students SET invoice_personal_address = ? WHERE id = ? AND deleted_at IS NULL',[value.address,id]);
 return value;
}
module.exports={AddressError,ready,separateReady,columns,address,recipient,choices,validate,current,save};
