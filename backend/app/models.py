from sqlalchemy import Column, String, Float, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime
from uuid import uuid4


def gen_id():
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    province = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    area_id = Column(String, nullable=True)
    area_name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="buyer")
    created_at = Column(DateTime, default=datetime.utcnow)
    cart_items = relationship("CartItem", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    price = Column(Float, nullable=False)
    original_price = Column(Float, nullable=True)
    category = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    description_images = Column(Text, nullable=True)
    specifications = Column(Text, nullable=True)
    sold_count = Column(Integer, default=0)
    stock = Column(Integer, default=0)
    rating = Column(Float, default=0.0)
    weight = Column(Integer, default=500)
    length = Column(Integer, default=10)
    width = Column(Integer, default=10)
    height = Column(Integer, default=10)
    primary_image = Column(String, nullable=True)
    video_url = Column(String, nullable=True)
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")


class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(String, primary_key=True, default=gen_id)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    image_url = Column(String, nullable=False)
    display_order = Column(Integer, default=0)
    product = relationship("Product", back_populates="images")


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id = Column(String, primary_key=True, default=gen_id)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_type = Column(String, nullable=True)
    variant_name = Column(String, nullable=False)
    price = Column(Float, nullable=True)
    price_modifier = Column(Float, default=0.0)
    stock = Column(Integer, default=0)
    is_available = Column(Boolean, default=True)
    product = relationship("Product", back_populates="variants")


class CartItem(Base):
    __tablename__ = "cart_items"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_name = Column(String, nullable=True)
    unit_price = Column(Float, nullable=True)
    quantity = Column(Integer, default=1)
    user = relationship("User", back_populates="cart_items")
    product = relationship("Product")


class Order(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True, default=gen_id)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    total = Column(Float, nullable=False)
    status = Column(String, default="pending")
    shipping_address = Column(Text, nullable=True)
    destination_area_id = Column(String, nullable=True)
    destination_postal_code = Column(String, nullable=True)
    destination_contact_name = Column(String, nullable=True)
    destination_contact_phone = Column(String, nullable=True)
    courier_company = Column(String, nullable=True)
    courier_type = Column(String, nullable=True)
    courier_service_name = Column(String, nullable=True)
    shipping_cost = Column(Float, default=0.0)
    shipping_etd = Column(String, nullable=True)
    biteship_order_id = Column(String, nullable=True)
    waybill_id = Column(String, nullable=True)
    tracking_status = Column(String, nullable=True)
    tracking_url = Column(String, nullable=True)
    payment_token = Column(String, nullable=True)
    payment_id = Column(String, nullable=True)
    midtrans_order_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(String, primary_key=True, default=gen_id)
    order_id = Column(String, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(String, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_name = Column(String, nullable=False)
    variant_name = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    weight = Column(Integer, default=500)
    order = relationship("Order", back_populates="items")
