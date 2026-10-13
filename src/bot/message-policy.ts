export interface MessagePolicyInput {
  isMentioned: boolean;
  isMuted: boolean;
}

export interface MessagePolicy {
  shouldReply: boolean;
  shouldCollect: false;
  shouldPersist: false;
}

export function getMessagePolicy(input: MessagePolicyInput): MessagePolicy {
  return {
    shouldReply: input.isMentioned && !input.isMuted,
    shouldCollect: false,
    shouldPersist: false,
  };
}
