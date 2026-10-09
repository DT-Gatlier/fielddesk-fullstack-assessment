export interface InAppNotification {
  id: string;
  title: string;
  description: string;
  workOrderId?: string;
  reference?: string;
  type: string;
  createdAt: string;
  isRead: boolean;
}
