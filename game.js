/* global Phaser, COIN_DASH */
const HIGH_SCORE_KEY = 'coinDash.highScore';
let audioCtx;
// Two-tone rising "ding", synthesized on the fly so no audio assets are needed.
function playCoinSound() {
  if (!audioCtx) audioCtx = new AudioContext();
  audioCtx.resume();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(988, t);
  osc.frequency.setValueAtTime(1319, t + 0.07);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}
class CoinDash extends Phaser.Scene {
  constructor() { super('CoinDash'); }

  create() {
    const c = COIN_DASH;
    this.score = 0;
    this.highScore = Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    this.finished = false;
    this.playerSpeed = c.playerSpeed;
    this.boostUntil = 0;
    this.deadline = this.time.now + c.roundSeconds * 1000;
    this.physics.world.setBounds(0, 44, c.width, c.height - 44);
    this.add.grid(c.width / 2, c.height / 2, c.width, c.height, 40, 40,
      c.colors.background, 1, 0x24334b, 0.45);
    this.hud = this.add.text(18, 12, '', { font: '18px monospace', color: '#ffffff' });
    this.player = this.add.rectangle(c.width / 2, c.height / 2, 24, 24, c.colors.player);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    // Shapes can't be tinted, so the coin is a white texture tinted per placement.
    if (!this.textures.exists('coin')) {
      this.make.graphics({ add: false }).fillStyle(0xffffff).fillCircle(9, 9, 9)
        .generateTexture('coin', 18, 18);
    }
    this.coin = this.physics.add.image(100, 100, 'coin');
    this.coin.body.setCircle(9);
    this.placeCoin();
    this.drones = this.physics.add.group();
    for (let i = 0; i < c.droneCount; i++) {
      const drone = this.add.rectangle(90 + i * 270, 100, 26, 26, c.colors.drone);
      this.drones.add(drone);
      drone.body.setCollideWorldBounds(true).setBounce(1, 1);
      const angle = (35 + i * 105) * Math.PI / 180;
      drone.body.setVelocity(Math.cos(angle) * c.droneSpeed, Math.sin(angle) * c.droneSpeed);
    }
    this.physics.add.overlap(this.player, this.coin, () => {
      if (this.finished) return;
      if (this.coinIsGreen) {
        // Green coins score nothing; they give a 4 second speed boost instead.
        this.playerSpeed *= 1.5;
        this.boostUntil = this.time.now + 4000;
      } else {
        this.score++;
      }
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem(HIGH_SCORE_KEY, this.highScore);
      }
      playCoinSound();
      this.placeCoin();
    });
    this.physics.add.overlap(this.player, this.drones, () => this.finish('A drone caught you!'));
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,R');
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
    // R can restart a paused round; make sure the physics world is running again.
    this.physics.resume();
    this.paused = false;
    this.pausedText = this.add.text(c.width / 2, c.height / 2, 'PAUSED',
      { font: '48px monospace', color: '#ffffff' }).setOrigin(0.5).setVisible(false);
    this.input.keyboard.on('keydown-P', () => this.togglePause());
  }

  togglePause() {
    if (this.finished) return;
    this.paused = !this.paused;
    if (this.paused) {
      // Keep the time left so the round resumes where it stopped.
      this.remaining = this.deadline - this.time.now;
      this.boostLeft = this.boostUntil ? this.boostUntil - this.time.now : 0;
      this.physics.pause();
    } else {
      this.deadline = this.time.now + this.remaining;
      if (this.boostLeft > 0) this.boostUntil = this.time.now + this.boostLeft;
      this.physics.resume();
    }
    this.pausedText.setVisible(this.paused);
  }

  placeCoin() {
    const c = COIN_DASH;
    // Avoid spawning the next coin directly underneath the player.
    let x, y;
    do {
      x = Phaser.Math.Between(25, c.width - 25);
      y = Phaser.Math.Between(70, c.height - 25);
    } while (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 60);
    // One in five coins is green (speed boost, no points).
    this.coinIsGreen = Math.random() < 0.2;
    this.coin.setTint(this.coinIsGreen ? 0x00ff00 : c.colors.coin);
    this.coin.setPosition(x, y);
    this.coin.body.reset(x, y);
  }

  update() {
    if (this.finished || this.paused) return;
    if (this.boostUntil && this.time.now >= this.boostUntil) {
      this.playerSpeed = COIN_DASH.playerSpeed;
      this.boostUntil = 0;
    }
    const dx =Number(this.cursors.right.isDown || this.keys.D.isDown)
      - Number(this.cursors.left.isDown || this.keys.A.isDown);
    const dy = Number(this.cursors.down.isDown || this.keys.S.isDown)
      - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const direction = new Phaser.Math.Vector2(dx, dy).normalize().scale(this.playerSpeed);
    this.player.body.setVelocity(direction.x, direction.y);
    const seconds = Math.max(0, Math.ceil((this.deadline - this.time.now) / 1000));
    this.hud.setText(`Coins: ${this.score}   High Score: ${this.highScore}   Time: ${seconds}s`);
    if (seconds === 0) this.finish('Time is up!');
  }

  finish(reason) {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    const c = COIN_DASH;
    this.add.rectangle(c.width / 2, c.height / 2, 460, 150, 0x0a1120, 0.95);
    this.add.text(c.width / 2, c.height / 2,
      `${reason}\n${this.score} coins collected\nPress R to try again`,
      { font: '24px monospace', color: '#ffffff', align: 'center', lineSpacing: 12 }
    ).setOrigin(0.5);
  }
}
window.coinDashGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COIN_DASH.width,
  height: COIN_DASH.height,
  backgroundColor: COIN_DASH.colors.background,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  scene: CoinDash
});
