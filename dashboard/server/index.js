import { start } from './app.js';
import { startAlbumSync } from './album.js';

await start();
startAlbumSync();
