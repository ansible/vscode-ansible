import { options } from "./server";
export function me() {
  return options.oneClick
    ? {
        rh_org_has_subscription: false,
        rh_user_has_seat: false,
        rh_user_is_org_admin: false,
        external_username: "ONE_CLICK_USER",
        username: "ONE_CLICK",
        org_telemetry_opt_out: false,
      }
    : {
        rh_org_has_subscription: true,
        rh_user_has_seat: true,
        rh_user_is_org_admin: true,
        external_username: "EXTERNAL_USERNAME",
        username: "USERNAME",
        org_telemetry_opt_out: false,
      };
}
