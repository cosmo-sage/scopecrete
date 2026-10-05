// The sign-in page: app.scopecrete.ai/login (src/app/login re-exports this),
// and / on previews and localhost. On scopecrete.ai itself / is the landing
// page (src/proxy.ts). The page is src/components/site/sign-in.tsx; this
// wrapper adds the site's fonts and, on a preview deployment, which one it is.
import { siteFonts } from "@/components/site/fonts";
import SignIn from "@/components/site/sign-in";
import { sandboxLabel } from "@/lib/sandbox";

export default function SignInPage() {
  return (
    <div className={siteFonts}>
      <SignIn sandbox={sandboxLabel()} />
    </div>
  );
}
