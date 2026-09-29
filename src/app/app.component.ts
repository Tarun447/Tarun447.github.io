import { Component, ElementRef, OnInit, signal, ViewChild, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { EMAILJS } from './config';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('bg') bg!: ElementRef<HTMLCanvasElement>;
  p = signal<any>(null);
  form = { name: '', email: '', message: '' };
  sending = signal('');
  photo = 'assets/photo-hd.jpg';
  io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.05 });
  observe() { setTimeout(() => document.querySelectorAll('.reveal:not(.in)').forEach(el => this.io.observe(el)), 50); }

  async ngOnInit() {
    this.p.set(await (await fetch('assets/profile.json', { cache: 'no-store' })).json());
    this.observe();
    window.addEventListener('mousemove', e => {
      const d = document.querySelector<HTMLElement>('.cursor-dot'), o = document.querySelector<HTMLElement>('.cursor-outline');
      if (d && o) { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; o.animate({ left: e.clientX + 'px', top: e.clientY + 'px' }, { duration: 400, fill: 'forwards' }); }
    });
  }

  ngAfterViewInit() {
    const canvas = this.bg.nativeElement;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000); cam.position.z = 3;
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    r.setSize(innerWidth, innerHeight); r.setPixelRatio(devicePixelRatio);
    const pos = new Float32Array(2100).map(() => (Math.random() - 0.5) * 10);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.015, color: 0x38bdf8, transparent: true, opacity: 0.6 }));
    scene.add(pts);
    let mx = 0, my = 0;
    addEventListener('mousemove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
    addEventListener('resize', () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); r.setSize(innerWidth, innerHeight); });
    const loop = () => { requestAnimationFrame(loop); pts.rotation.y += 0.001 + mx * 0.01; pts.rotation.x += 0.0005 + my * 0.01; r.render(scene, cam); };
    loop();
  }

  async send() {
    this.sending.set('Sending…');
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: EMAILJS.serviceId, template_id: EMAILJS.templateId, user_id: EMAILJS.publicKey,
          template_params: { from_name: this.form.name, reply_to: this.form.email, message: this.form.message } })
      });
      if (!res.ok) throw 0;
      this.sending.set('Thanks! Your message has been sent.'); this.form = { name: '', email: '', message: '' };
    } catch { this.sending.set('Could not send. Please email me directly.'); }
  }
}
