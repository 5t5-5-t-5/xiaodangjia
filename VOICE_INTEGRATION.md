# 问之队长配音接入与原稿合并

## 本次音量增强（20261106-loud1）

在同一版人声、语速和干脆收尾的基础上，提高语音主体响度，补一点低中频厚度，并使用压缩和过采样限幅控制峰值。新音频在 `audio/captain/v2/`，旧 v1 文件保留以兼容尚未刷新的页面。播放器逻辑和记账逻辑不变。

首次接入已由 Claude 合并进原稿。这次请再把原稿中两个 script 标签的查询参数改为 `20261106-loud1`，并更新导出页面的 BUILD（当前分支为 `20261106captainloud1`）。保留并发布更新后的 `captain-voice-pack.js` 与 v2 录音目录，防止 iPad 继续读取缓存里的旧音量。


这次把已确认的「清楚、句尾有力」声音接入现有任务卡。家长设置中选择 **🦾 问之队长** 即可使用。其余系统声音风格继续保留。

## 已接入的内容

- 27 张积分任务卡：朗读任务名、任务完成、实际奖励的 2/5/10 分。
- 19 张挣钱任务卡：朗读任务名、任务完成、存进 1 块钱；需要还预支时继续读出还款提示。
- 称呼、任务提示、加分等 10 条已确认录音，以及取消/重复记录等简短确认。
- 补记过去日期、改名或改金额、商品和自由输入等没有完整对应录音的动态文本，继续走现有系统朗读。不会用错误分数或金额的录音代替。

录音优先只在 `vPref.style === "captain"` 时生效。其他风格、记账逻辑、同步方式和已有记录不变。设备原来选择了其他风格时，需在家长设置中切换一次。

## Claude 的 src.html 必须合并这些接入点

`src.html` 不在这个仓库中。首次接入已合并到原稿；下面保留完整接法，后续重新生成页面时应继续保留。本次音量更新只需同步上文的版本参数与录音目录。

1. 保留仓库根目录的 `captain-voice.js`、`captain-voice-pack.js` 和 `audio/captain/v2/`，不要在重新导出页面时删除它们。
2. 在生成的两个页面的主脚本 **之前** 加入：

```html
<script src="captain-voice-pack.js?v=20261106-loud1"></script>
<script src="captain-voice.js?v=20261106-loud1"></script>
```

3. 读取 `vPref` 之后加上：

```js
if (window.XDJCaptainVoice) {
  window.XDJCaptainVoice.setEnabled(() => vPref.style === "captain");
}
```

4. 在原有 `say(text)` 的开头加入以下代码，其后保留原来的队长/系统声音分支：

```js
clearTimeout(capTimer);
try { speechSynthesis.cancel(); } catch (e) {}
if (window.XDJCaptainVoice) {
  window.XDJCaptainVoice.stop();
  if (vPref.style === "captain" &&
      window.XDJCaptainVoice.play(text, () => sayCaptain(text))) return;
}
```

5. 在 `voiceUI()` 里显示队长录音已启用的说明，保留备用系统声音的下拉框。具体代码可直接对照本次两个 HTML 的差异。
6. 初始化时可预取常用短句和第一张卡片（这里只请求录音，不会自动播放）：

```js
if (window.XDJCaptainVoice) {
  window.XDJCaptainVoice.preload([
    PAGE === "pts" ? "points-oral" : "bank-mop", "attention", "ready"
  ]);
}
```

7. 两个生成页面的 `BUILD` 都更新为 `20261106captainloud1`，以便已添加到 iPad 主屏幕的旧页面通过现有版本检查换上新页面。以后修改接入代码或录音时，也要更新版本及脚本查询参数。

## 播放行为

`captain-voice-pack.js` 将实际 `say(text)` 文本映射到录音文件。路径相对于当前脚本解析，支持 GitHub Pages 的 `/xiaodangjia/` 子路径。

iPad 的音频上下文在点击的捕获阶段创建/恢复，先于记账的异步操作；记账成功后的 `say()` 才开始播报。连续点击时，新提示会取消旧提示和未完成的播放请求，避免声音重叠。离开页面后停止录音，返回后在下一次点击恢复。录音下载/解码失败时，回到现有系统队长朗读。

改动现有卡片的名称或分值时，需要补相应录音并更新 `captain-voice-pack.js`；在此之前会自动使用系统朗读。静态 GitHub Pages 无法仅凭这些 MP3 任意生成同音色的新句子。

## 检查

```sh
node --test tests/captain-voice.test.cjs
```

本地预览应通过 HTTP 打开，不要直接用 `file://` 打开 HTML。浏览器测试使用独立的新会话和本地测试记录，不使用家庭同步钥匙。

桌面模拟的 iPad 浏览器检查不能替代真实 iPad 主屏幕模式的最终试听；上线后需在 iPad 上点「问之队长」并试听一张积分卡、一张存折卡。
