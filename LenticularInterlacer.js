import * as THREE from 'three';

export class LenticularInterlacer {
    // 建構子移除 separation 參數
    constructor(renderer, dpi, lpi, angle, phase = 0) {
        this.renderer = renderer;
        this.dpi = dpi;
        this.lpi = lpi;
        this.angle = angle;
        this.phase = phase;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const pars = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };

        const width = renderer.domElement.width;
        const height = renderer.domElement.height;

        // 保持關閉 Mipmap 以避免紋理採樣雜訊
        this.rtLeft = new THREE.WebGLRenderTarget(width, height, pars);
        // this.rtLeft.texture.generateMipmaps = false;

        this.rtRight = new THREE.WebGLRenderTarget(width, height, pars);
        // this.rtRight.texture.generateMipmaps = false;

        this.initShader();
    }

    initShader() {
        // 1. 角度修正 (cosine correction)
        const radAngle = this.angle * Math.PI / 180;
        const cosAngle = Math.cos(radAngle);
        const safeCos = Math.abs(cosAngle) < 0.0001 ? 1.0 : cosAngle;

        // Pitch 計算
        const pitchPixels = (this.dpi / this.lpi) / safeCos;
        const tanAngle = Math.tan(radAngle);

        const shader = {
            uniforms: {
                tLeft: { value: null },
                tRight: { value: null },
                uPitch: { value: pitchPixels },
                uTanAngle: { value: tanAngle },
                uPhase: { value: this.phase },
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
                uniform float uPhase;
                uniform vec2 uResolution;
                varying vec2 vUv;

                // 【新增】一個簡單的水平模糊採樣函數
                vec4 sampleBlurred(sampler2D tex, vec2 uv) {
                    // 計算一個像素在 UV 空間中的寬度
                    float pixelWidth = 1.0 / uResolution.x;
                    
                    // 模糊半徑：數值越大越模糊，抗摩爾紋越強，但畫面越軟
                    // 建議從 0.5 到 1.0 之間嘗試
                    float blurRadius = 0.75; 

                    // 採樣中心點
                    vec4 c = texture2D(tex, uv);
                    // 採樣左側點
                    vec4 l = texture2D(tex, uv + vec2(-pixelWidth * blurRadius, 0.0));
                    // 採樣右側點
                    vec4 r = texture2D(tex, uv + vec2(pixelWidth * blurRadius, 0.0));

                    // 簡單平均 (也可以用加權平均: c*0.5 + l*0.25 + r*0.25)
                    return (c + l + r) / 3.0;
                }

                void main() {
                    float x = gl_FragCoord.x;
                    float y = gl_FragCoord.y;
                    
                    float pos = x + y * uTanAngle + uPhase;
                    float phaseVal = mod(pos, uPitch);

                    vec4 color;

                    // 50/50 切分
                    if (phaseVal < uPitch * 0.5) {
                        // 【修改】改用模糊採樣函數
                        color = sampleBlurred(tLeft, vUv);
                    } else {
                        // 【修改】改用模糊採樣函數
                        color = sampleBlurred(tRight, vUv);
                    }

                    gl_FragColor = color;
                }
            `
        };

        this.material = new THREE.ShaderMaterial(shader);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(plane);
    }

    setSize(width, height) {
        this.rtLeft.setSize(width, height);
        this.rtRight.setSize(width, height);
        if (this.material) {
            this.material.uniforms.uResolution.value.set(width, height);
        }
    }

    // 更新設定 (移除 separation)
    updateConfig(dpi, lpi, angle, phase) {
        this.dpi = dpi || this.dpi;
        this.lpi = lpi || this.lpi;
        this.angle = angle !== undefined ? angle : this.angle;
        this.phase = phase !== undefined ? phase : this.phase;

        // 重新計算含 Cos 修正的 Pitch
        const radAngle = this.angle * Math.PI / 180;
        const cosAngle = Math.cos(radAngle);
        const safeCos = Math.abs(cosAngle) < 0.0001 ? 1.0 : cosAngle;
        const pitchPixels = (this.dpi / this.lpi) / safeCos;
        const tanAngle = Math.tan(radAngle);

        if (this.material) {
            this.material.uniforms.uPitch.value = pitchPixels;
            this.material.uniforms.uTanAngle.value = tanAngle;
            this.material.uniforms.uPhase.value = this.phase;
        }
    }

    render() {
        this.material.uniforms.tLeft.value = this.rtLeft.texture;
        this.material.uniforms.tRight.value = this.rtRight.texture;
        this.renderer.setRenderTarget(null);
        this.renderer.setScissorTest(false);
        this.renderer.render(this.scene, this.camera);
    }
}