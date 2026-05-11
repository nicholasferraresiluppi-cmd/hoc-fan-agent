"use client";

// Date+time picker per il campo publishAt di un draft.
// L'admin sceglie giorno/ora, il componente emette timestamp ms.

export default function SchedulePicker(/* { value, onChange } */) {
  // TODO: <input type="datetime-local"> con conversione a/da Date.now()
  return <input type="datetime-local" className="bg-[#1B1E26] text-[#F5F6F8] rounded p-2" />;
}
