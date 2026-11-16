import { noteRepository } from "../../repositories/note.repository";
import { createNoteService } from "./service";
import type { NoteOperations } from "./types";

export const noteService: NoteOperations = createNoteService({ notes: noteRepository });
