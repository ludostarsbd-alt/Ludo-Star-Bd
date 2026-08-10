import { Router, type IRouter } from "express";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

const router: IRouter = Router();
const apkPath = path.resolve(
  __dirname,
  "assets",
    "LUDO-STAR-BD-v1.0.0.apk",
);

router.get("/download/ludo-star-bd.apk", (_req, res): void => {
  try {
    const { size } = statSync(apkPath);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Length", size);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="LUDO-STAR-BD-v1.0.0.apk"',
    );
    res.setHeader("Cache-Control", "public, max-age=3600");

    createReadStream(apkPath)
      .on("error", () => {
        if (!res.headersSent) {
          res.status(404).json({ error: "APK is not available" });
        } else {
          res.destroy();
        }
      })
      .pipe(res);
  } catch {
    res.status(404).json({ error: "APK is not available" });
  }
});

export default router;