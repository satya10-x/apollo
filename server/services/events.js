import { EventEmitter } from "node:events";
export const events = new EventEmitter();
events.setMaxListeners(200);
export function publish(id, session) {
  events.emit(String(id), session.toObject ? session.toObject() : session);
}
