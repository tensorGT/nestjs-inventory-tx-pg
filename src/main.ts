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
