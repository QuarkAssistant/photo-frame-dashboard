import { start } from './app.js';
import { startAlbumSync } from './album.js';
import { startTagger } from './tagger.js';
import { listReminderItems, setReminderNotes } from './reminders.js';

await start();
startAlbumSync();
if (process.platform === 'darwin' && process.env.REMINDERS_GROCERY_LIST && process.env.GROCERY_TAGGER !== 'off') {
  startTagger({ list: listReminderItems, setNotes: setReminderNotes });
}
