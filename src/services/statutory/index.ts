export type { StatutoryCategory } from "@/domain/statutoryInfo";
export {
  getAttachedNotes,
  getStatutoryTemplate,
} from "./statutoryInfoRegistry";
export {
  buildStatutoryTabViewModel,
  dismissStatutoryPrompt,
  getStatutoryPromptCardsForToday,
  markStatutoryPromptShown,
  snoozeStatutoryPrompt,
  statutoryMarkersByDate,
  type StatutoryTabItem,
  type StatutoryTabViewModel,
  type StatutoryUrgencyGroup,
} from "./statutoryInfoService";
export {
  formatCompliancePeriodLabel,
  formatStatutoryDueLine,
  formatStatutoryPeriodLine,
  getMonthlyCompliancePeriodForDueDate,
} from "./statutoryCompliancePeriod";
export {
  daysUntilDue,
  generateAllStatutoryDues,
  generateMonthlyDueOccurrences,
  occurrenceId,
} from "./statutoryDeadlineEngine";
export {
  getEnabledStatutoryTemplates,
  STATUTORY_INFO_REGISTRY,
} from "./statutoryInfoRegistry";
