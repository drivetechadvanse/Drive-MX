import { AdminNewShipmentCard } from './components/AdminNewShipmentCard.js';
import { NewShipmentForm } from './components/NewShipmentForm.js';
import { PublicGuideTracker, TrackingStatusCard } from './components/PublicGuideTracker.js';
import * as NewShipmentServices from './services/newShipmentService.js';

export {
  AdminNewShipmentCard,
  NewShipmentForm,
  PublicGuideTracker,
  TrackingStatusCard,
  NewShipmentServices
};

globalThis.DriveMxNewShipment = {
  AdminNewShipmentCard,
  NewShipmentForm,
  PublicGuideTracker,
  TrackingStatusCard,
  services: NewShipmentServices
};
