"use client";

import { useEffect, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";

interface Banner {
  id: number;
  image_url: string;
  title?: string;
  link?: string;
  order: number;
  is_active: boolean;
}

interface Props {
  banners: Banner[];
}

export default function BannerSlider({ banners }: Props) {
  const active = [...banners].filter((b) => b.is_active).sort((a, b) => a.order - b.order);

  if (active.length === 0) return null;

  const BannerImage = ({ b }: { b: Banner }) => (
    <img
      src={b.image_url}
      alt={b.title || "Banner toko"}
      className="w-full object-cover"
      style={{ aspectRatio: "3/1" }}
    />
  );

  if (active.length === 1) {
    const b = active[0];
    return (
      <div className="w-full">
        {b.link ? (
          <a href={b.link} target="_blank" rel="noopener noreferrer">
            <BannerImage b={b} />
          </a>
        ) : (
          <BannerImage b={b} />
        )}
      </div>
    );
  }

  return (
    <div className="w-full banner-slider">
      <style>{`
        .banner-slider .swiper-button-next,
        .banner-slider .swiper-button-prev {
          color: white;
          background: rgba(0,0,0,0.3);
          width: 36px;
          height: 36px;
          border-radius: 50%;
          padding: 8px;
        }
        .banner-slider .swiper-button-next::after,
        .banner-slider .swiper-button-prev::after {
          font-size: 14px;
          font-weight: bold;
        }
        .banner-slider .swiper-pagination-bullet-active {
          background: white;
        }
        .banner-slider .swiper-pagination-bullet {
          background: rgba(255,255,255,0.6);
          opacity: 1;
        }
      `}</style>
      <Swiper
        modules={[Autoplay, Pagination, Navigation]}
        autoplay={{ delay: 4500, disableOnInteraction: false, pauseOnMouseEnter: true }}
        pagination={{ clickable: true }}
        navigation
        loop
        speed={600}
        className="w-full"
      >
        {active.map((b) => (
          <SwiperSlide key={b.id}>
            {b.link ? (
              <a href={b.link} target="_blank" rel="noopener noreferrer">
                <BannerImage b={b} />
              </a>
            ) : (
              <BannerImage b={b} />
            )}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
