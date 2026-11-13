/** A Bot pair shares one private conversation, separate from their human chats. */
export interface PrivateChatRef {
  id: string;
  botIds: [string, string];
}

export interface PrivateChatSummary extends PrivateChatRef {
  updatedAt: number;
  preview: string;
  messageCount: number;
  busy: boolean;
}
