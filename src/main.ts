import { BadRequestException, Body, Controller, Get, Module, Post, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IsInt, Min } from "class-validator";
import { Pool } from "pg";
import "reflect-metadata";

class PlaceOrderDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsInt()
  @Min(1)
  qty!: number;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/inv_db",
});

@Controller("orders")
class OrdersController {
  @Post()
  async placeOrder(@Body() dto: PlaceOrderDto) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // lock product row so two requests dont sell same stock
      const prodRes = await client.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [dto.productId]);
      const prod = prodRes.rows[0];
      if (!prod) throw new BadRequestException("product not found");
      if (prod.stock < dto.qty) throw new BadRequestException("not enough stock left");

      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [dto.qty, dto.productId]);
      const totalCents = prod.price_cents * dto.qty;
