import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { CardPage } from "../components/CardPage.tsx";
import SettingsForm from "../islands/SettingsForm.tsx";
import styles from "./settings.module.css";

export default define.page(async function Settings(ctx) {
  const isDesktop = await ctx.state.platform.isDesktop();
  return (
    <>
      <Head>
        <title>Settings — Writasaurus</title>
      </Head>
      <CardPage size="wide" brandHref="/" roomy>
        <h2>Settings</h2>
        <p class={styles.intro}>
          Customize your writing environment. Preferences are stored locally on this device.
        </p>
        <SettingsForm isDesktop={isDesktop} />
      </CardPage>
    </>
  );
});
