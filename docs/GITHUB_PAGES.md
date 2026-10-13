# GitHub Pages 离线版

发布地址：<https://vix1994.github.io/pokesurvivor/>

本版本在独立的 `gh-pages` 分支维护，`main` 不受发布改动影响。GitHub Pages 的发布来源为 `gh-pages` 分支的 `/ (root)`，推送此分支会触发部署。

## 运行模式

`js/core/firebase-config.js` 设为 `null`，使用浏览器本地账号和存档，不连接原作者的 Firebase。Google 登录、云端同步、好友、排行榜和合作模式不可用。游客模式不保存退出后的进度。

页面和素材均为静态文件。在线版按需加载素材；完整断网游玩可[下载本分支 ZIP](https://github.com/Vix1994/pokesurvivor/archive/refs/heads/gh-pages.zip)，解压后直接打开 `index.html`。

网页和本地文件使用不同的浏览器存储位置，不会自动共享存档。清除网站数据会删除本地存档。

## 更新发布版本

在 `gh-pages` 分支修改并验证，不向 `main` 合并部署配置。如需引入 `main` 的游戏改动，可选择性 cherry-pick 对应提交，并保留此分支的本地模式配置。

站点根地址由 `site.config.json` 指定。构建脚本生成首页和静态页面的 canonical、分享图片、站点地图及子目录下的 404 链接。不要添加原作者域名的 `CNAME`。

使用 Node.js 和 Python 3.12+：

```sh
git switch gh-pages
node tools/build.js
node tools/export_data.js
python tools/make_seo_pages.py
node --test tools/test_i18n.js tools/test_pages.js
```

确认后提交生成文件并执行 `git push origin gh-pages`。在仓库 Settings → Pages 查看发布状态；此站点使用默认 GitHub 域名，Custom domain 留空。

如以后需要云端功能，请配置自己的 Firebase 和相关服务，并同步修改运行模式说明。上游素材、作者署名和许可保留在 `CREDITS.md` 与 `LICENSE`。
