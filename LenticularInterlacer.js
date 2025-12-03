import * as THREE from 'three';

export class LenticularInterlacer {
    constructor(renderer, dpi, lpi, angle) {
        this.renderer = renderer;
        this.dpi = dpi;
        this.lpi = lpi;
        this.angle = angle;

        // 內部場景 (用於渲染 Shader)
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // 建立 Render Targets (左右眼緩衝區)
        const pars = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat
        };

        // 初始大小，稍後會透過 setSize 更新
        const width = renderer.domElement.width;
        const height = renderer.domElement.height;

        this.rtLeft = new THREE.WebGLRenderTarget(width, height, pars);
        this.rtRight = new THREE.WebGLRenderTarget(width, height, pars);

        // 初始化 Shader
        this.initShader();
    }

    initShader() {
        const pitchPixels = this.dpi / this.lpi;
        const tanAngle = Math.tan(this.angle * Math.PI / 180);

        const shader = {
            uniforms: {
                tLeft: { value: null },
                tRight: { value: null },
                uPitch: { value: pitchPixels },
                uTanAngle: { value: tanAngle },
                uResolution: { value: new THREE.Vector2(this.rtLeft.width, this.rtLeft.height) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform sampler2D tLeft;
                uniform sampler2D tRight;
                uniform float uPitch;
                uniform float uTanAngle;
                uniform vec2 uResolution;
                varying vec2 vUv;

                void main() {
                    float x = gl_FragCoord.x;
                    float y = gl_FragCoord.y;
                    
                    // 計算光柵位置
                    float pos = x + y * uTanAngle;
                    float phase = mod(pos, uPitch);

                    vec4 color;
                    if (phase < uPitch * 0.5) {
                        color = texture2D(tLeft, vUv);
                    } else {
                        color = texture2D(tRight, vUv);
                    }
                    gl_FragColor = color;
                }
            `
        };

        this.material = new THREE.ShaderMaterial(shader);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(plane);
    }

    /**
     * 更新尺寸 (當視窗縮放時呼叫)
     */
    setSize(width, height) {
        // 更新 Render Targets 大小
        this.rtLeft.setSize(width, height);
        this.rtRight.setSize(width, height);

        // 更新 Shader 解析度參數
        if (this.material) {
            this.material.uniforms.uResolution.value.set(width, height);
        }
    }

    /**
     * 更新光柵參數 (如果需要動態調整)
     */
    updateConfig(dpi, lpi, angle) {
        this.dpi = dpi || this.dpi;
        this.lpi = lpi || this.lpi;
        this.angle = angle !== undefined ? angle : this.angle;

        const pitchPixels = this.dpi / this.lpi;
        const tanAngle = Math.tan(this.angle * Math.PI / 180);

        this.material.uniforms.uPitch.value = pitchPixels;
        this.material.uniforms.uTanAngle.value = tanAngle;
    }

    /**
     * 執行交織合成渲染
     * 將 rtLeft 和 rtRight 的內容合成到螢幕上
     */
    render() {
        this.material.uniforms.tLeft.value = this.rtLeft.texture;
        this.material.uniforms.tRight.value = this.rtRight.texture;

        this.renderer.setRenderTarget(null); // 輸出到螢幕
        this.renderer.setScissorTest(false); // 關閉裁切以繪製全屏
        this.renderer.render(this.scene, this.camera);
    }
}