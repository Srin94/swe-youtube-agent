import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(1);
// 1080p60 h264 is configured per-render via the CLI (--codec=h264).
