import { AccountSettings } from "@/components/v34/settings/account-settings";

/**
 * Settings itself. On a phone the layout's list of sections is the page; on a
 * desktop the list sits on the left and Account is shown beside it.
 */
export default function SettingsHome() {
  return <div className="hidden lg:block"><AccountSettings /></div>;
}
