import shipsSheetUrl from '../../../assets/spritesheet/ships_miscellaneous_sheet.png?url';
import shipsSheetXml from '../../../assets/spritesheet/ships_miscellaneous_sheet.xml?raw';
import tilesSheetUrl from '../../../assets/tilesheet/tiles_sheet_retina.png?url';
import uiSheetUrl from '../../../assets/spritesheet/ui_sheet.png?url';
import uiSheetRetinaUrl from '../../../assets/spritesheet/ui_sheet_retina.png?url';
import waterTileUrl from '../../../assets/png/retina/tiles/tile_73.png?url';
import uiSheetData from '../../../assets/spritesheet/ui_sheet.json';
import uiSheetRetinaData from '../../../assets/spritesheet/ui_sheet_retina.json';

/**
 * Textures required before combat starts. URLs are fingerprinted by Vite so
 * they can be cached forever; atlas descriptors are bundled as data.
 */
export const GAME_ASSETS = {
  shipsSheet: { url: shipsSheetUrl, xml: shipsSheetXml },
  tilesSheet: { url: tilesSheetUrl, tileSize: 128, resolution: 2, columns: 16, rows: 6 },
  water: { url: waterTileUrl },
  uiSheet: { url: uiSheetUrl, data: uiSheetData },
  uiSheetRetina: { url: uiSheetRetinaUrl, data: uiSheetRetinaData },
} as const;
