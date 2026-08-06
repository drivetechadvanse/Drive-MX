import { EnterGuideNumberCard } from './components/EnterGuideNumberCard.js';
import * as GuideNumberEntryServices from './services/guideNumberEntryService.js';

export { EnterGuideNumberCard, GuideNumberEntryServices };

globalThis.DriveMxGuideNumberEntry = {
  EnterGuideNumberCard,
  services: GuideNumberEntryServices
};
