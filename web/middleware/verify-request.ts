import { Shopify } from "@shopify/shopify-api";
import { Application, RequestHandler } from "express";
import ensureBilling, {
  ShopifyBillingError,
} from "../helpers/ensure-billing";
import redirectToAuth from "../helpers/redirect-to-auth";

import returnTopLevelRedirection from "../helpers/return-top-level-redirection";
import { BillingSettingsType } from "../index";

const TEST_GRAPHQL_QUERY = `
{
  shop {
    name
  }
}`;

export default function verifyRequest(
  app: Application,
  { billing = { required: false } }: { billing: BillingSettingsType },
) {
  return async (req: any, res: any, next: () => any) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens"),
    );

    let shop = Shopify.Utils.sanitizeShop(req.query.shop);
    if (session && shop && session.shop !== shop) {
      // The current request is for a different shop. Redirect gracefully.
      return redirectToAuth(req, res, app);
    }

    if (session?.isActive()) {
      try {
        if (billing.required) {
          // The request to check billing status serves to validate that the access token is still valid.
          const [hasPayment, confirmationUrl] = await ensureBilling(
            session,
            billing,
          );

          if (!hasPayment) {
            returnTopLevelRedirection(req, res, confirmationUrl);
            return;
          }
        } else {
          // Make a request to ensure the access token is still valid. Otherwise, re-authenticate the user.
          const client = new Shopify.Clients.Graphql(
            session.shop,
            session.accessToken,
          );
          await client.query({ data: TEST_GRAPHQL_QUERY });
        }
        return next();
      } catch (e) {
        if (
          e instanceof Shopify.Errors.HttpResponseError &&
          e.response.code === 401
        ) {
          // Re-authenticate if we get a 401 response
        } else if (e instanceof ShopifyBillingError) {
          console.error(e.message, (e as ShopifyBillingError).errorData[0]);
          res.status(500).end();
          return;
        } else {
          throw e;
        }
      }
    }

    const bearerPresent = req.headers.authorization?.match(/Bearer (.*)/);
    if (bearerPresent) {
      if (!shop) {
        if (session) {
          shop = session.shop;
        } else if (Shopify.Context.IS_EMBEDDED_APP) {
          if (bearerPresent) {
            const payload = Shopify.Utils.decodeSessionToken(bearerPresent[1]);
            shop = payload.dest.replace("https://", "");
          }
        }
      }
    }
    if (!shop) throw new Error("No shop query parameter provided");
    returnTopLevelRedirection(
      req,
      res,
      `/api/auth?shop=${encodeURIComponent(shop)}`,
    );
  };
}
