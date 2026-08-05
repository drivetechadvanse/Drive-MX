import { GuideAssignmentPanel } from './components/GuideAssignmentPanel.js';
import * as GuideAssignmentServices from './services/guideAssignmentService.js';

export { GuideAssignmentPanel, GuideAssignmentServices };

globalThis.DriveMxGuideAssignment = {
  GuideAssignmentPanel,
  services: GuideAssignmentServices
};
