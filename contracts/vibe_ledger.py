# { "Depends": "py-genlayer:test" }

from genlayer import *


class VibeLedger(gl.Contract):
    headline: str
    entries: DynArray[str]

    def __init__(self, headline: str):
        self.headline = headline
        self.entries = DynArray()

    @gl.public.view
    def get_headline(self) -> str:
        return self.headline

    @gl.public.view
    def get_entries(self):
        return [entry for entry in self.entries]

    @gl.public.write
    def drop_vibe(self, mood: str, note: str):
        clean_mood = mood.strip().lower().replace("||", "/")[0:24]
        clean_note = note.strip().replace("||", "/")[0:280]
        sender = f"{gl.message.sender_address}"
        self.entries.append(f"{clean_mood}||{clean_note}||{sender}")
