/**
 * Secret-free GRIN Admin project/bucket preflight.
 * Prints only selected names / diagnostic codes. Does not print FIREBASE_CONFIG
 * or process.env. Does not read Firestore/Storage documents or objects.
 *
 * Isolated inspect ports: does not initialize a live Firebase Admin app.
 */
import {
  preflightGrinAdminBinding,
  type GrinAdminAppLike,
  type GrinAdminAppPorts,
} from "../../functions/src/goodsEvidence/productionAdminConfig";

const inspectPorts: GrinAdminAppPorts = {
  getApps: () => [],
  initializeApp(options) {
    const app: GrinAdminAppLike = {
      name: "[DEFAULT]",
      options: { projectId: options.projectId, storageBucket: options.storageBucket },
    };
    return app;
  },
};

const result = preflightGrinAdminBinding(process.env, inspectPorts);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
