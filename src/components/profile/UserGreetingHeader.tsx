import React from "react";

import {
  DigitalBusinessIdentityCard,
  type DigitalBusinessIdentityCardProps,
} from "@/components/you/DigitalBusinessIdentityCard";

export type UserGreetingHeaderProps = DigitalBusinessIdentityCardProps;

export type { DigitalBusinessIdentityCardProps };

/** You dashboard hero — digital business identity card with flip + share. */
export function UserGreetingHeader(props: UserGreetingHeaderProps) {
  return <DigitalBusinessIdentityCard {...props} />;
}
