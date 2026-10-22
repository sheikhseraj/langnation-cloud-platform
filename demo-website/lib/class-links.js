'use strict';
function valid(value){if(typeof value!=='string'||!value.trim())return false;try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}}
// A lesson override takes priority; invalid destinations are never rendered as links.
function room(record={}) {
  const value=record.current_meeting_url||record.meeting_url||record.batch_meeting_url;
  return valid(value)?value:null;
}
// Matches the daily lesson selected by attendance.recordJoin/startClass.
function todayRoomSql() {
  return "(SELECT l.meeting_url FROM lessons l WHERE l.intake_id = i.id AND DATE(l.starts_at) = UTC_DATE() AND l.status <> 'cancelled' ORDER BY l.starts_at LIMIT 1) AS current_meeting_url";
}
module.exports={valid,room,todayRoomSql};
